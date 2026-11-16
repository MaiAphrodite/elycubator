import { useEffect, useRef, useState } from "react";

const TICK_MS = 1000;

/**
 * One sample per second: 1 when a frame arrived during that second, else 0.
 * Reading it back as a strip shows the link breathing rather than asserting a
 * boolean, and a dead socket leaves an obvious flat line.
 */
export function useHeartbeat(lastReceivedAt: number | null, length: number): number[] {
  const [beats, setBeats] = useState<number[]>(() => Array<number>(length).fill(0));
  const latest = useRef(lastReceivedAt);

  useEffect(() => {
    latest.current = lastReceivedAt;
  }, [lastReceivedAt]);

  useEffect(() => {
    let previous = latest.current;
    const timer = setInterval(() => {
      const current = latest.current;
      const beat = current !== null && current !== previous ? 1 : 0;
      previous = current;
      setBeats((prev) => [...prev.slice(1), beat]);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, []);

  return beats;
}
