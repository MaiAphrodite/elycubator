import { useEffect } from "react";
import { useTelemetryStream } from "./useTelemetryStream";
import { useIncubation } from "./useIncubation";
import { useNow } from "./useNow";
import { evaluateAlerts } from "../lib/alerts";

const TICK_MS = 5000;

/** First moment the engine ran, used as the age baseline before any frame. */
let startedAt: number | null = null;

/**
 * Runs the alert rules once per mount point. Mounted in the shell, so alerts
 * keep being evaluated while the user is on any route, and the slow tick keeps
 * stale detection alive when the socket has gone quiet.
 *
 * Before the first frame the age counts from engine start, so a fresh page load
 * is not reported as a dead device.
 */
export function useAlertEngine(): void {
  const { current, settings, lastReceivedAt } = useTelemetryStream();
  const { incubation } = useIncubation();
  const now = useNow(TICK_MS);

  const days = incubation?.hari_ke ?? 0;

  useEffect(() => {
    if (startedAt === null) startedAt = now;
    const frameAgeMs =
      lastReceivedAt === null ? Math.max(0, now - startedAt) : Math.max(0, now - lastReceivedAt);

    evaluateAlerts({
      temperature: current.temperature,
      humidity: current.humidity,
      targetTemp: incubation?.target_suhu ?? settings?.targetTemp ?? null,
      targetHumidity: settings?.targetHumidity ?? null,
      frameAgeMs,
      days,
    });
  }, [
    now,
    lastReceivedAt,
    current.temperature,
    current.humidity,
    incubation?.target_suhu,
    settings?.targetTemp,
    settings?.targetHumidity,
    days,
  ]);
}
