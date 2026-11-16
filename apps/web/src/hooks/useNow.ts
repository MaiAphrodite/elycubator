import { useEffect, useState } from "react";

/**
 * Current time, sampled on an interval. Reading the clock during render is
 * impure, so components that show elapsed times read this instead.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
