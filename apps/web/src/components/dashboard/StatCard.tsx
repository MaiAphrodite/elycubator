import { Badge, Box, Card, Group, Text, ThemeIcon } from "@mantine/core";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";
import { motion } from "framer-motion";
import { DURATION, EASE, riseIn } from "../../lib/motion";
import type { ReactNode } from "react";
import { BRAND_RAMP } from "../../theme";
import { formatDelta } from "../../lib/time";

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly subtitle: string;
  readonly icon: ReactNode;
  readonly color: string;
  /** Signed difference from the setpoint, shown as a chip next to the label. */
  readonly delta?: number | null;
  readonly deltaUnit?: string;
  /** Recent samples for the trend strip along the bottom of the card. */
  readonly trend?: readonly number[];
  readonly targetValue?: number;
  /** Two-up layout for phones: no trend strip, tighter padding. */
  readonly compact?: boolean;
}

const SPARK_COLORS: Record<string, string> = {
  brand: BRAND_RAMP[7],
  sage: "#6C8455",
  amber: "#C1731F",
};

/** Anything inside this counts as on target in the delta chip. */
const TOLERANCE = { temperature: 0.3, humidity: 2 };

function deltaBadge(delta: number | null | undefined, unit: string) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return null;
  const scale = unit === "%" ? TOLERANCE.humidity : TOLERANCE.temperature;
  const onTarget = Math.abs(delta) <= scale;
  return (
    <Badge
      size="sm"
      variant="light"
      color={onTarget ? "sage" : "amber"}
      radius="xl"
      tt="none"
      style={{ flexShrink: 0 }}
    >
      {onTarget ? "on target" : `${formatDelta(delta)}${unit}`}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  color,
  delta,
  deltaUnit = "",
  trend,
  targetValue,
  compact = false,
}: StatCardProps) {
  const strokeColor = SPARK_COLORS[color] ?? SPARK_COLORS.brand;
  const samples = trend ?? [];
  const hasTrend = samples.length > 1;
  const lowest = hasTrend ? Math.min(...samples) : 0;
  const highest = hasTrend ? Math.max(...samples) : 0;

  return (
    <motion.div variants={riseIn} style={{ height: "100%" }}>
      <Card
        className="stat-card"
        padding={compact ? "sm" : "md"}
        radius="lg"
        h="100%"
        style={{ display: "flex", flexDirection: "column", gap: 0 }}
      >
        <Group gap={compact ? 8 : "sm"} wrap="nowrap" align="flex-start">
          {!compact && (
            <ThemeIcon variant="light" color={color} size={48} radius="lg" style={{ flexShrink: 0 }}>
              {icon}
            </ThemeIcon>
          )}

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text
              size="xs"
              c="dimmed"
              fw={700}
              tt={compact ? undefined : "uppercase"}
              lts={compact ? undefined : "0.04em"}
              truncate
            >
              {label}
            </Text>
            <Group gap={8} wrap="wrap" align="center">
              <motion.span
                key={value === "—" ? "empty" : "data"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.state, ease: EASE.enter }}
                style={{ display: "inline-block" }}
              >
                <Text
                  fz={compact ? "1.35rem" : { base: "1.65rem", sm: "1.8rem", lg: "2rem" }}
                  fw={800}
                  lh={1.1}
                  ff="monospace"
                >
                  {value}
                </Text>
              </motion.span>
              {!compact && deltaBadge(delta, deltaUnit)}
            </Group>
            {compact && <Box mt={2}>{deltaBadge(delta, deltaUnit)}</Box>}
            <Text size="xs" c="dimmed" ff="monospace" truncate>
              {subtitle}
            </Text>
          </Box>
        </Group>

        {!compact && hasTrend && (
          <Box mt="sm">
            <Box style={{ height: 40 }} aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={samples.map((v, i) => ({ i, v }))}
                  margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={["dataMin - 0.4", "dataMax + 0.4"]} hide />
                  {targetValue !== undefined && (
                    <ReferenceLine
                      y={targetValue}
                      stroke={BRAND_RAMP[9]}
                      strokeDasharray="4 4"
                      strokeOpacity={0.45}
                      strokeWidth={1}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={strokeColor}
                    fill={`url(#spark-${label})`}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
            <Group justify="space-between" mt={2}>
              <Text size="xs" c="dimmed" ff="monospace">
                min {lowest.toFixed(1)}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                max {highest.toFixed(1)}
              </Text>
            </Group>
          </Box>
        )}
      </Card>
    </motion.div>
  );
}
