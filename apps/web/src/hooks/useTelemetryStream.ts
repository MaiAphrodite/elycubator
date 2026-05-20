import { useState, useEffect, useCallback, useRef } from "react";
import type { TelemetryReading } from "../types/telemetry";

const MAX_HISTORY = 30;
const TICK_MS = 2000;

const AMBIENT_TEMP = 28.0;
const AMBIENT_HUMIDITY = 70.0;
const TARGET_TEMP = 37.5;
const TARGET_HUMIDITY = 55.0;

const LAMP_HEAT_PER_SEC = 0.4;
const FAN_COOL_PER_SEC = 0.2;
const FAN_DRY_PER_SEC = 1.2;
const THERMAL_LEAK_PER_SEC = 0.04;
const HUMIDITY_LEAK_PER_SEC = 0.02;

const DHT22_TEMP_NOISE = 0.25;
const DHT22_HUMID_NOISE = 1.0;

const FAULT_CHANCE = 0.008;
const FAULT_DURATION_MS = 8000;

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

function tick(): TelemetryReading {
  const dt = TICK_MS / 1000;
  const now = Date.now();

  const tempError = TARGET_TEMP - sim.temperature;
  let lampDuty = clamp(tempError * 12 + noise(3), 0, 100);

  const humidError = sim.humidity - TARGET_HUMIDITY;
  let fanDuty = clamp(humidError * 6 + noise(3), 0, 100);

  if (sim.temperature > TARGET_TEMP + 0.5) {
    fanDuty = Math.max(fanDuty, 30 + (sim.temperature - TARGET_TEMP) * 15);
  }

  if (!sim.lampEnabled) lampDuty = 0;
  if (!sim.fanEnabled) fanDuty = 0;

  sim.lampDuty = clamp(lampDuty, 0, 100);
  sim.fanDuty = clamp(fanDuty, 0, 100);

  sim.temperature += (sim.lampDuty / 100) * LAMP_HEAT_PER_SEC * dt;
  sim.temperature -= (sim.fanDuty / 100) * FAN_COOL_PER_SEC * dt;
  sim.temperature += THERMAL_LEAK_PER_SEC * (AMBIENT_TEMP - sim.temperature) * dt;

  sim.humidity -= (sim.fanDuty / 100) * FAN_DRY_PER_SEC * dt;
  sim.humidity += HUMIDITY_LEAK_PER_SEC * (AMBIENT_HUMIDITY - sim.humidity) * dt;

  if (sim.lampDuty > 30) {
    sim.humidity -= 0.03 * (sim.lampDuty / 100) * dt;
  }

  if (now > sim.faultUntil && Math.random() < FAULT_CHANCE) {
    sim.faultUntil = now + FAULT_DURATION_MS;
  }

  if (now < sim.faultUntil) {
    sim.temperature += noise(2.0);
    sim.humidity += noise(4.0);
  }

  sim.temperature += noise(DHT22_TEMP_NOISE);
  sim.humidity += noise(DHT22_HUMID_NOISE);

  sim.temperature = clamp(sim.temperature, 15, 50);
  sim.humidity = clamp(sim.humidity, 10, 95);

  return {
    time: new Date().toLocaleTimeString([], {
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

export function useTelemetryStream() {
  const [current, setCurrent] = useState<TelemetryReading>(() => tick());
  const [history, setHistory] = useState<readonly TelemetryReading[]>([]);
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
