import { Group, Text } from "@mantine/core";
import { useFrameAge } from "../hooks/useFrameAge";
import { useHeartbeat } from "../hooks/useHeartbeat";
import { formatElapsed } from "../lib/time";

const STALE_AFTER_MS = 8000;
const SAMPLES = 16;

interface LinkTraceProps {
  readonly lastReceivedAt: number | null;
  /** Print the age next to the trace. Off where a row already states it. */
  readonly showAge?: boolean;
  readonly width?: number;
}

/**
 * Telemetry liveness as a strip of per-second ticks. Deliberately not a pill
 * with a dot: the ticks are the data, so a stalled link looks stalled instead
 * of just changing colour.
 */
export function LinkTrace({ lastReceivedAt, showAge = true, width = 64 }: LinkTraceProps) {
  const age = useFrameAge(lastReceivedAt);
  const beats = useHeartbeat(lastReceivedAt, SAMPLES);
  const stale = age === null || age > STALE_AFTER_MS;

  // Text colour keeps the trace legible in both schemes; only a stall changes hue.
  const color = stale ? "var(--mantine-color-amber-6)" : "var(--mantine-color-text)";
  const height = 18;
  const step = width / SAMPLES;
  const barWidth = Math.max(2, step - 1.6);

  const label =
    age === null
      ? "Waiting for the first reading"
      : stale
        ? `No data for ${formatElapsed(age)}`
        : `Receiving data, updated ${formatElapsed(age)} ago`;

  return (
    <Group gap={8} wrap="nowrap" role="status" aria-label={label}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
        {/* Baseline: silence looks like a flat line, not a gap. */}
        <rect x={0} y={height - 3} width={width} height={1.5} rx={0.75} fill={color} opacity={0.3} />
        {beats.map((beat, index) =>
          beat ? (
            <rect
              key={index}
              x={index * step}
              y={2}
              width={barWidth}
              height={height - 5}
              rx={1}
              fill={color}
              opacity={0.35 + 0.65 * (index / Math.max(1, SAMPLES - 1))}
            />
          ) : null,
        )}
      </svg>
      {showAge && (
        <Text size="xs" ff="monospace" c={stale ? "amber.7" : "dimmed"} style={{ flexShrink: 0 }}>
          {age === null ? "no data" : `${(age / 1000).toFixed(1)}s`}
        </Text>
      )}
    </Group>
  );
}
