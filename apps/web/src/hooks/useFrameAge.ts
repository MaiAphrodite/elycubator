import { useNow } from "./useNow";

const TICK_MS = 1000;

/**
 * Age in ms of the last telemetry frame, re-rendered once a second.
 * Returns null before the first frame arrives.
 */
export function useFrameAge(lastReceivedAt: number | null): number | null {
  const now = useNow(TICK_MS);
  return lastReceivedAt === null ? null : Math.max(0, now - lastReceivedAt);
}
