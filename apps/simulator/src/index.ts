import { PIDController } from "./pid";
import { createInitialState, stepPhysics, type ChamberState } from "./physics";
import {
  API_BASE_URL,
  MAC_ADDRESS,
  PAIRING_PIN,
  TICK_INTERVAL_MS,
} from "./config";

interface DeviceSettings {
  targetTemp: number;
  targetHumidity: number;
  tempKp: number;
  tempKi: number;
  tempKd: number;
  humidKp: number;
  humidKi: number;
  humidKd: number;
  turnIntervalHrs: number;
  turnAngle: number;
  servoTrigger: boolean;
  lampEnabled: boolean;
  fanEnabled: boolean;
}

const DEFAULT_SETTINGS: DeviceSettings = {
  targetTemp: 37.5,
  targetHumidity: 55.0,
  tempKp: 2.0,
  tempKi: 0.5,
  tempKd: 1.0,
  humidKp: 1.5,
  humidKi: 0.3,
  humidKd: 0.5,
  turnIntervalHrs: 4,
  turnAngle: 90,
  servoTrigger: false,
  lampEnabled: true,
  fanEnabled: true,
};

let deviceId: string | null = null;
let deviceToken: string | null = null;
let settings: DeviceSettings = { ...DEFAULT_SETTINGS };
let chamber: ChamberState = createInitialState();
let ws: WebSocket | null = null;

const tempPID = new PIDController(settings.tempKp, settings.tempKi, settings.tempKd);
const humidPID = new PIDController(settings.humidKp, settings.humidKi, settings.humidKd);

async function registerDevice(): Promise<void> {
  console.log(`📡 Registering device ${MAC_ADDRESS}...`);

  // In a real device, DEVICE_SECRET is burned into firmware.
  // For the simulator, we read it from the environment.
  const secret = process.env.DEVICE_SECRET || "dev-device-secret";
  
  const text = `${MAC_ADDRESS}:${PAIRING_PIN}`;
  
  // Bun native crypto for HMAC
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(text)
  );
  
  const hmacSignature = Buffer.from(signatureBuffer).toString("hex");

  const res = await fetch(`${API_BASE_URL}/api/device/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ macAddress: MAC_ADDRESS, pairingPin: PAIRING_PIN, hmacSignature }),
  });

  const data = await res.json() as { success: boolean; deviceId: string; deviceToken: string; claimed: boolean; message: string; error?: string };

  if (!data.success) {
    throw new Error(`Device registration failed: ${data.error || JSON.stringify(data)}`);
  }

  console.log(`✅ Device registered: ${data.deviceId} (claimed: ${data.claimed})`);
  deviceId = data.deviceId;
  deviceToken = data.deviceToken;
}

function connectWebSocket() {
  if (!deviceToken) return;

  const wsUrl = API_BASE_URL.replace("http://", "ws://").replace("https://", "wss://");
  ws = new WebSocket(`${wsUrl}/api/device/stream?token=${deviceToken}`);

  ws.onopen = () => {
    console.log("🔌 WebSocket Connected. Streaming telemetry...");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "SETTINGS_UPDATE" && msg.payload) {
        console.log("📥 Received Settings Update:", msg.payload);
        settings = { ...settings, ...msg.payload };
        
        tempPID.updateGains(settings.tempKp, settings.tempKi, settings.tempKd);
        humidPID.updateGains(settings.humidKp, settings.humidKi, settings.humidKd);
        
        if (settings.servoTrigger) {
          triggerServo();
          // We clear the flag locally since the server already handled it.
          settings.servoTrigger = false; 
        }
      }
    } catch (e) {
      console.warn("Failed to parse WS message", e);
    }
  };

  ws.onclose = () => {
    console.log("❌ WebSocket Disconnected. Reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  };
  
  ws.onerror = (e) => {
    console.error("⚠ WebSocket error", e);
  };
}

function triggerServo(): void {
  const targetAngle = settings.turnAngle;
  console.log(`🔄 Servo triggered: rotating to ${targetAngle}°`);
  chamber.servoAngle = targetAngle;
  chamber.lastTurnTime = Date.now();

  setTimeout(() => {
    chamber.servoAngle = 0;
    console.log("🔄 Servo returned to 0°");
  }, 3000);
}

function checkAutoTurn(): void {
  if (settings.turnIntervalHrs <= 0) return;
  const intervalMs = settings.turnIntervalHrs * 3600 * 1000;
  const elapsed = Date.now() - chamber.lastTurnTime;

  if (elapsed >= intervalMs) {
    console.log("⏰ Auto egg turn triggered");
    triggerServo();
  }
}

function tick(): void {
  const dt = TICK_INTERVAL_MS / 1000;

  let lampDuty = tempPID.compute(settings.targetTemp, chamber.temperature, dt);
  let fanDuty = humidPID.compute(settings.targetHumidity, chamber.humidity, dt);

  if (chamber.temperature > settings.targetTemp + 0.5) {
    fanDuty = Math.max(fanDuty, 40);
  }
  if (chamber.temperature < settings.targetTemp - 1) {
    lampDuty = Math.min(lampDuty + 20, 100);
  }

  if (!settings.lampEnabled) lampDuty = 0;
  if (!settings.fanEnabled) fanDuty = 0;

  chamber = stepPhysics(chamber, lampDuty, fanDuty, dt);

  checkAutoTurn();

  if (chamber.hasFault) {
    console.log(
      `📊 T=${chamber.temperature.toFixed(1)}°C H=${chamber.humidity.toFixed(1)}% ` +
      `💡${chamber.lampDuty.toFixed(0)}% 🌀${chamber.fanDuty.toFixed(0)}% ` +
      `⚠ ${chamber.faultType}`
    );
  }

  // Stream over WebSocket instead of HTTP
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      temperature: Number(chamber.temperature.toFixed(2)),
      humidity: Number(chamber.humidity.toFixed(2)),
      lampDuty: Number(chamber.lampDuty.toFixed(1)),
      fanDuty: Number(chamber.fanDuty.toFixed(1)),
      servoAngle: chamber.servoAngle,
    }));
  }
}

async function main(): Promise<void> {
  console.log("🐣 Elycubator Simulator Starting...");
  console.log(`   API: ${API_BASE_URL}`);
  console.log(`   MAC: ${MAC_ADDRESS}`);
  console.log(`   Tick: ${TICK_INTERVAL_MS}ms`);
  console.log("");

  try {
    await registerDevice();
  } catch (err) {
    console.error("❌ Cannot register device. Is the API running?");
    console.error((err as Error).message);
    console.log("⏳ Retrying in 5s...");
    setTimeout(main, 5000);
    return;
  }

  connectWebSocket();

  setInterval(tick, TICK_INTERVAL_MS);

  console.log("🟢 Simulator running. Press Ctrl+C to stop.\n");
}

main();
