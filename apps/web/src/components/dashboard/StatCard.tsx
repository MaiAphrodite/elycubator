import { Card, Group, Text, Stack, ThemeIcon, Box } from "@mantine/core";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { TelemetryReading } from "../../types/telemetry";

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly subtitle: string;
  readonly icon: ReactNode;
  readonly color: string;
  readonly sparklineData: readonly TelemetryReading[];
  readonly sparklineKey: keyof TelemetryReading;
  readonly sparklineDomain: [number, number];
}

const SPARK_COLORS: Record<string, string> = {
  teal: "#12b886",
  blue: "#339af0",
  violet: "#7950f2",
};

const cardVariant = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  color,
  sparklineData,
  sparklineKey,
  sparklineDomain,
}: StatCardProps) {
  const strokeColor = SPARK_COLORS[color] ?? SPARK_COLORS.teal;

  return (
    <motion.div variants={cardVariant} style={{ height: "100%" }}>
      <Card
        className="stat-card"
        padding={0}
        radius="lg"
        withBorder
        h="100%"
        style={{
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Box
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "55%",
            opacity: 0.15,
            pointerEvents: "none",
            maskImage: "linear-gradient(to right, transparent 0%, black 40%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 40%)",
          }}
        >
          {sparklineData.length > 1 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sparklineData as TelemetryReading[]}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`spark-${sparklineKey}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={1} />
                    <stop
                      offset="100%"
                      stopColor={strokeColor}
                      stopOpacity={0.2}
                    />
                  </linearGradient>
                </defs>
                <YAxis domain={["dataMin - 0.3", "dataMax + 0.3"]} hide />
                <Area
                  type="monotone"
                  dataKey={sparklineKey}
                  stroke={strokeColor}
                  fill={`url(#spark-${sparklineKey})`}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Box>

        <Box style={{ position: "relative", zIndex: 1 }} p="md">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon
              variant="light"
              color={color}
              size={42}
              radius="lg"
              style={{ flexShrink: 0 }}
            >
              {icon}
            </ThemeIcon>

            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" truncate>
                {label}
              </Text>
              <Text
                size="xl"
                fw={800}
                lh={1}
                ff="monospace"
                truncate
              >
                {value}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                {subtitle}
              </Text>
            </Stack>
          </Group>
        </Box>
      </Card>
    </motion.div>
  );
}
