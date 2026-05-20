export interface ChamberState {
  temperature: number;
  humidity: number;
  lampDuty: number;
  fanDuty: number;
  servoAngle: number;
  lastTurnTime: number;
  hasFault: boolean;
  faultType: string | null;
}

const AMBIENT_TEMP_BASE = 28.0;
const AMBIENT_HUMIDITY_BASE = 70.0;

const LAMP_HEAT_RATE = 0.15;
const FAN_COOL_RATE = 0.08;
const FAN_DRY_RATE = 0.6;
const THERMAL_LEAK_RATE = 0.005;
const HUMIDITY_DRIFT_RATE = 0.003;

const DHT22_TEMP_NOISE = 0.3;
const DHT22_HUMIDITY_NOISE = 1.5;

const FAULT_PROBABILITY = 0.005;
const FAULT_DURATION_MS = 10_000;

let faultEndTime = 0;
let ambientDrift = 0;
let ambientHumidityDrift = 0;

function noise(amplitude: number): number {
  return (Math.random() - 0.5) * 2 * amplitude;
}

function getAmbientTemp(): number {
  ambientDrift += noise(0.05);
  ambientDrift = Math.max(-3, Math.min(3, ambientDrift));
  return AMBIENT_TEMP_BASE + ambientDrift;
}

function getAmbientHumidity(): number {
  ambientHumidityDrift += noise(0.1);
  ambientHumidityDrift = Math.max(-8, Math.min(8, ambientHumidityDrift));
  return AMBIENT_HUMIDITY_BASE + ambientHumidityDrift;
}

export function createInitialState(): ChamberState {
  return {
    temperature: AMBIENT_TEMP_BASE + noise(1),
    humidity: AMBIENT_HUMIDITY_BASE + noise(3),
    lampDuty: 0,
    fanDuty: 0,
    servoAngle: 0,
    lastTurnTime: Date.now(),
    hasFault: false,
    faultType: null,
  };
}

export function stepPhysics(
  state: ChamberState,
  lampDuty: number,
  fanDuty: number,
  dt: number,
): ChamberState {
  const now = Date.now();
  const ambientTemp = getAmbientTemp();
  const ambientHumidity = getAmbientHumidity();

  let { temperature, humidity, servoAngle, lastTurnTime } = state;
  let hasFault = false;
  let faultType: string | null = null;

  const lampFraction = lampDuty / 100;
  const fanFraction = fanDuty / 100;

  temperature += LAMP_HEAT_RATE * lampFraction * dt;
  temperature -= FAN_COOL_RATE * fanFraction * dt;
  temperature += THERMAL_LEAK_RATE * (ambientTemp - temperature) * dt;

  humidity -= FAN_DRY_RATE * fanFraction * dt;
  humidity += HUMIDITY_DRIFT_RATE * (ambientHumidity - humidity) * dt;

  if (lampFraction > 0.3) {
    humidity -= 0.02 * lampFraction * dt;
  }

  if (now < faultEndTime) {
    hasFault = true;
    faultType = state.faultType;
    if (faultType === "sensor_spike") {
      temperature += noise(3);
      humidity += noise(8);
    } else if (faultType === "door_open") {
      temperature += (ambientTemp - temperature) * 0.1 * dt;
      humidity += (ambientHumidity - humidity) * 0.15 * dt;
    } else if (faultType === "heater_surge") {
      temperature += 0.5 * dt;
    }
  } else if (Math.random() < FAULT_PROBABILITY) {
    hasFault = true;
    const faults = ["sensor_spike", "door_open", "heater_surge"] as const;
    faultType = faults[Math.floor(Math.random() * faults.length)];
    faultEndTime = now + FAULT_DURATION_MS;
    console.warn(`⚠ FAULT: ${faultType} (duration: ${FAULT_DURATION_MS / 1000}s)`);
  }

  temperature += noise(DHT22_TEMP_NOISE);
  humidity += noise(DHT22_HUMIDITY_NOISE);

  temperature = Math.max(15, Math.min(50, temperature));
  humidity = Math.max(10, Math.min(95, humidity));

  return {
    temperature,
    humidity,
    lampDuty,
    fanDuty,
    servoAngle,
    lastTurnTime,
    hasFault,
    faultType,
  };
}
