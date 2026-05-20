import { useState, useEffect, useCallback, useRef } from "react";
import type { TelemetryReading } from "../types/telemetry";

const MAX_HISTORY = 50;
const TICK_MS = 1000; // 1-second comfortable visual interval for clear chart tracking

const AMBIENT_TEMP = 28.0;
const AMBIENT_HUMIDITY = 70.0;
const TARGET_TEMP = 37.5;
const TARGET_HUMIDITY = 55.0;

// High-inertia physics for natural "fighter-jet" instability and gorgeous oscillations
const LAMP_HEAT_RATE = 2.4;         // High heat potential
const FAN_COOL_RATE = 1.6;          // Strong cooling draft
const FAN_DRY_RATE = 5.5;           // Dries humidity quickly
const THERMAL_LEAK_RATE = 0.12;      // Constant heat loss draft
const HUMIDITY_LEAK_RATE = 0.08;    // Constant humidity draft

const DHT22_TEMP_NOISE = 0.08;
const DHT22_HUMID_NOISE = 0.3;

const FAULT_CHANCE = 0.015;
const FAULT_DURATION_MS = 3000;

interface SimState {
  temperature: number;
  humidity: number;
  lampDuty: number;
  fanDuty: number;
  servoAngle: number;
  lampEnabled: boolean;
  fanEnabled: boolean;
  faultUntil: number;
  
  // Thermal & Speed Inertia (creates the phase-lag delay essential for unstable oscillations)
  lampThermalInertia: number;
  fanSpeedInertia: number;
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
  lampThermalInertia: 0,
  fanSpeedInertia: 0,
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

  // Slow ambient drift
  const timeSec = now / 1000;
  const activeAmbientTemp = AMBIENT_TEMP + Math.sin(timeSec / 45) * 1.5;
  const activeAmbientHumid = AMBIENT_HUMIDITY + Math.cos(timeSec / 35) * 4.0;

  // 1. Under-damped, highly aggressive Proportional feedback
  const tempError = TARGET_TEMP - sim.temperature;
  let lampDuty = clamp(tempError * 28 + noise(2), 0, 100); 

  const humidError = sim.humidity - TARGET_HUMIDITY;
  let fanDuty = clamp(humidError * 16 + noise(2), 0, 100);

  // Active cross-coupling: if temp shoots too high, fan over-corrects aggressively
  if (sim.temperature > TARGET_TEMP + 0.15) {
    fanDuty = Math.max(fanDuty, 45 + (sim.temperature - TARGET_TEMP) * 40);
  }

  if (!sim.lampEnabled) lampDuty = 0;
  if (!sim.fanEnabled) fanDuty = 0;

  sim.lampDuty = clamp(lampDuty, 0, 100);
  sim.fanDuty = clamp(fanDuty, 0, 100);

  // 2. Physics Inertia / Phase Lag (Heater takes time to warm up/cool down, creating dynamic overshoots)
  sim.lampThermalInertia += (sim.lampDuty - sim.lampThermalInertia) * 0.35 * dt;
  sim.fanSpeedInertia += (sim.fanDuty - sim.fanSpeedInertia) * 0.45 * dt;

  // Apply thermal updates based on inertia
  sim.temperature += (sim.lampThermalInertia / 100) * LAMP_HEAT_RATE * dt;
  sim.temperature -= (sim.fanSpeedInertia / 100) * FAN_COOL_RATE * dt;
  sim.temperature += THERMAL_LEAK_RATE * (activeAmbientTemp - sim.temperature) * dt;

  // 3. Rhythmic Competing Dynamics (Fan introduces wet/dry drafts, Lamp dries chamber rapidly)
  sim.humidity -= (sim.fanSpeedInertia / 100) * FAN_DRY_RATE * dt;
  sim.humidity += HUMIDITY_LEAK_RATE * (activeAmbientHumid - sim.humidity) * dt;

  // Lamp convection drying effect
  if (sim.lampThermalInertia > 5) {
    sim.humidity -= 0.65 * (sim.lampThermalInertia / 100) * dt;
  }

  // Snappy fault events
  if (!targetTimeMs && now > sim.faultUntil && Math.random() < FAULT_CHANCE) {
    sim.faultUntil = now + FAULT_DURATION_MS;
  }

  if (now < sim.faultUntil) {
    sim.temperature += noise(1.5);
    sim.humidity += noise(3.0);
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

// Warm up from ambient to generate a beautiful, oscillating startup history curve
function generateInitialHistory(): TelemetryReading[] {
  const list: TelemetryReading[] = [];
  const now = Date.now();
  
  sim.temperature = AMBIENT_TEMP;
  sim.humidity = AMBIENT_HUMIDITY;
  sim.lampDuty = 0;
  sim.fanDuty = 0;
  sim.lampThermalInertia = 0;
  sim.fanSpeedInertia = 0;

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
