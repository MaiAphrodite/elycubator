import { useState, useCallback, useEffect } from "react";
import { useTelemetryStream } from "./useTelemetryStream";
import { apiFetch } from "../lib/api";

export interface IncubationState {
  target_suhu: number;
  mode_auto: number;
  hari_ke: number;
  turner_test: number;
  target_suhu_set: number;
  target_suhu_hatch: number;
  kp_set: number;
  ki_set: number;
  kd_set: number;
  kp_hatch: number;
  ki_hatch: number;
  kd_hatch: number;
  kp: number;
  ki: number;
  kd: number;
  waktu_mulai: number;
}

export function phaseLabel(hariKe: number, modeAuto: number): { label: string; color: string } {
  if (hariKe <= 0) return { label: "Standby (H-0)", color: "gray" };
  if (modeAuto === 1 && hariKe >= 19) return { label: `HATCHER (H-${hariKe})`, color: "orange" };
  return { label: `SETTER (H-${hariKe})`, color: modeAuto === 1 ? "teal" : "blue" };
}

export function useIncubation() {
  const { deviceId } = useTelemetryStream();
  const [incubation, setIncubation] = useState<IncubationState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await apiFetch(`/api/device/${deviceId}/incubation`);
      const json = await res.json();
      if (json?.success && json.data) setIncubation(json.data as IncubationState);
    } catch {
      /* offline — keep last known */
    }
  }, [deviceId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const runAction = useCallback(
    async (name: string, fn: () => Promise<Response>) => {
      setBusy(name);
      try {
        await fn();
      } catch {
        /* offline — state refreshes on next poll */
      } finally {
        setBusy(null);
        refresh();
      }
    },
    [refresh],
  );

  const start = useCallback(() => {
    if (!deviceId) return;
    runAction("start", () =>
      apiFetch(`/api/device/${deviceId}/incubation/start`, { method: "POST" }),
    );
  }, [deviceId, runAction]);

  const stop = useCallback(() => {
    if (!deviceId) return;
    runAction("stop", () =>
      apiFetch(`/api/device/${deviceId}/incubation/stop`, { method: "POST" }),
    );
  }, [deviceId, runAction]);

  const testTurner = useCallback(() => {
    if (!deviceId) return;
    runAction("turner", () =>
      apiFetch(`/api/device/${deviceId}/incubation/test-turner`, { method: "POST" }),
    );
  }, [deviceId, runAction]);

  const setModeAuto = useCallback(
    (val: boolean) => {
      if (!deviceId) return;
      runAction("mode", () =>
        apiFetch(`/api/device/${deviceId}/incubation/mode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ val }),
        }),
      );
    },
    [deviceId, runAction],
  );

  return { deviceId, incubation, busy, refresh, start, stop, testTurner, setModeAuto } as const;
}
