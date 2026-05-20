import { useState, useEffect, useCallback, useRef } from "react";
import type { TelemetryReading } from "../types/telemetry";

const MAX_HISTORY = 45;
const TICK_MS = 400; // 400ms tick for ultra-fast, smooth, real-time visual updates!

const AMBIENT_TEMP = 28.0;
const AMBIENT_HUMIDITY = 70.0;
const TARGET_TEMP = 37.5;
const TARGET_HUMIDITY = 55.0;

// High-speed, high-intensity physics for maximum visual excitement in real-time graphs
const LAMP_HEAT_PER_SEC = 2.8;      // Hyper-fast heating
const FAN_COOL_PER_SEC = 1.9;       // Hyper-fast cooling
const FAN_DRY_PER_SEC = 7.5;        // Rapid drying action
const THERMAL_LEAK_PER_SEC = 0.25;  // Fast thermal leak decay
const HUMIDITY_LEAK_PER_SEC = 0.20; // Fast humidity recovery leak

const DHT22_TEMP_NOISE = 0.12;
const DHT22_HUMID_NOISE = 0.4;

const FAULT_CHANCE = 0.035;         // More frequent interesting events
const FAULT_DURATION_MS = 2000;    // Shorter, snappier faults

interface SimState {
  temperature: number;
  humidity: number;
  lampDuty: number;
  fanDuty: number;
  servoAngle: number;
  lampEnabled: boolean;
  fanEnabled: boolean;
  faultUntil: number;
}

const sim: SimState = {
  temperature: AMBIENT_TEMP,
  humidity: AMBIENT_HUMIDITY,
  lampDuty: 0,
  fanDuty: 0,
  servoAngle: 0,
  lampEnabled: true,
  fanEnabled: true,
  faultUntil: 0,
};

function clamp(val: number, lo: number, hi: number): number {
  return Math.min(Math.max(val, lo), hi);
}

function noise(amp: number): number {
  return (Math.random() - 0.5) * 2 * amp;
}

function tick(targetTimeMs?: number): TelemetryReading {
  const dt = TICK_MS / 1000;
  const now = targetTimeMs ?? Date.now();

  // Fast-oscillating room environmental dynamics for visually stunning waves
  const timeSec = now / 1000;
  const activeAmbientTemp = AMBIENT_TEMP + Math.sin(timeSec / 8) * 3.5; // Rapid sine wave swing
  const activeAmbientHumid = AMBIENT_HUMIDITY + Math.cos(timeSec / 6) * 10.0; // Rapid cos wave swing

  const tempError = TARGET_TEMP - sim.temperature;
  let lampDuty = clamp(tempError * 22 + noise(5), 0, 100); // Extreme PID responsiveness

  const humidError = sim.humidity - TARGET_HUMIDITY;
  let fanDuty = clamp(humidError * 14 + noise(5), 0, 100);

  // Severe Thermal/Humidity Coupling
  if (sim.temperature > TARGET_TEMP + 0.2) {
    fanDuty = Math.max(fanDuty, 50 + (sim.temperature - TARGET_TEMP) * 35);
  }

  if (!sim.lampEnabled) lampDuty = 0;
  if (!sim.fanEnabled) fanDuty = 0;

  sim.lampDuty = clamp(lampDuty, 0, 100);
  sim.fanDuty = clamp(fanDuty, 0, 100);

  // Apply Physics Engine
  sim.temperature += (sim.lampDuty / 100) * LAMP_HEAT_PER_SEC * dt;
  sim.temperature -= (sim.fanDuty / 100) * FAN_COOL_PER_SEC * dt;
  sim.temperature += THERMAL_LEAK_PER_SEC * (activeAmbientTemp - sim.temperature) * dt;

  sim.humidity -= (sim.fanDuty / 100) * FAN_DRY_PER_SEC * dt;
  sim.humidity += HUMIDITY_LEAK_PER_SEC * (activeAmbientHumid - sim.humidity) * dt;

  // Radiation drying effect
  if (sim.lampDuty > 10) {
    sim.humidity -= 0.45 * (sim.lampDuty / 100) * dt;
  }

  // SNAPPY Random Fault triggers
  if (!targetTimeMs && now > sim.faultUntil && Math.random() < FAULT_CHANCE) {
    sim.faultUntil = now + FAULT_DURATION_MS;
  }

  if (now < sim.faultUntil) {
    sim.temperature += noise(3.0);
    sim.humidity += noise(6.0);
  }

  sim.temperature += noise(DHT22_TEMP_NOISE);
  sim.humidity += noise(DHT22_HUMID_NOISE);

  sim.temperature = clamp(sim.temperature, 15, 50);
  sim.humidity = clamp(sim.humidity, 10, 95);

  const readingTime = new Date(now);

  return {
    time: readingTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    temperature: sim.temperature,
    humidity: sim.humidity,
    lampDuty: sim.lampDuty,
    fanDuty: sim.fanDuty,
    servoAngle: sim.servoAngle,
  };
}

// Generate beautiful stabilization curve instantly on mount
function generateInitialHistory(): TelemetryReading[] {
  const list: TelemetryReading[] = [];
  const now = Date.now();
  
  sim.temperature = AMBIENT_TEMP;
  sim.humidity = AMBIENT_HUMIDITY;
  sim.lampDuty = 0;
  sim.fanDuty = 0;

  for (let i = 0; i < MAX_HISTORY; i++) {
    const timeOffset = now - (MAX_HISTORY - 1 - i) * TICK_MS;
    list.push(tick(timeOffset));
  }
  return list;
}

export function useTelemetryStream() {
  const [history, setHistory] = useState<readonly TelemetryReading[]>(() => generateInitialHistory());
  const [current, setCurrent] = useState<TelemetryReading>(() => history[history.length - 1]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const reading = tick();
      setCurrent(reading);
      setHistory((prev) => {
        const next = [...prev, reading];
        return next.length > MAX_HISTORY
          ? next.slice(next.length - MAX_HISTORY)
          : next;
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const setLampEnabled = useCallback((enabled: boolean) => {
    sim.lampEnabled = enabled;
  }, []);

  const setFanEnabled = useCallback((enabled: boolean) => {
    sim.fanEnabled = enabled;
  }, []);

  const triggerServo = useCallback(() => {
    sim.servoAngle = 90;
    setTimeout(() => {
      sim.servoAngle = 0;
    }, 3000);
  }, []);

  const exportAsCsv = useCallback(() => {
    if (history.length === 0) return;

    const header = "Time,Temperature,Humidity,Lamp Duty,Fan Duty,Servo Angle";
    const rows = history.map(
      (r) =>
        `${r.time},${r.temperature.toFixed(2)},${r.humidity.toFixed(2)},${r.lampDuty.toFixed(1)},${r.fanDuty.toFixed(1)},${r.servoAngle}`
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incubator_telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [history]);

  return {
    current,
    history,
    lampEnabled: sim.lampEnabled,
    fanEnabled: sim.fanEnabled,
    setLampEnabled,
    setFanEnabled,
    triggerServo,
    exportAsCsv,
  } as const;
}
