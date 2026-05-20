import {
  Stack,
  Title,
  Text,
  Card,
  Group,
  Badge,
  ActionIcon,
  useMantineColorScheme,
} from "@mantine/core";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { IconHistory, IconDownload } from "@tabler/icons-react";
import { useTelemetryStream } from "../hooks/useTelemetryStream";
import type { TelemetryReading } from "../types/telemetry";

const COLORS = {
  temperature: "#12b886",
  humidity: "#339af0",
  target: "#fa5252",
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  metricLabel,
}: TooltipContentProps & { unit: string; metricLabel: string }) {
  if (!active || !payload?.[0]) return null;
  const value = payload[0].value;

  return (
    <Card
      padding={8}
      radius="sm"
      shadow="sm"
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        backgroundColor: "var(--mantine-color-body)",
      }}
    >
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={700} ff="monospace" c={payload[0].color}>
        {metricLabel}: {typeof value === "number" ? value.toFixed(1) : value}
        {unit}
      </Text>
    </Card>
  );
}

interface MiniChartProps {
  readonly data: readonly TelemetryReading[];
  readonly dataKey: keyof TelemetryReading;
  readonly color: string;
  readonly label: string;
  readonly unit: string;
  readonly domain: [number, number];
  readonly targetValue?: number;
  readonly gridColor: string;
  readonly axisColor: string;
}

function TelemetryMiniChart({
  data,
  dataKey,
  color,
  label,
  unit,
  domain,
  targetValue,
  gridColor,
  axisColor,
}: MiniChartProps) {
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Group gap={6}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: color,
            }}
          />
          <Text size="xs" fw={600}>
            {label}
          </Text>
        </Group>
        {targetValue !== undefined && (
          <Text size="xs" c="dimmed" ff="monospace">
            Target: {targetValue}
            {unit}
          </Text>
        )}
      </Group>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart
          data={data as TelemetryReading[]}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={gridColor}
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: axisColor }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 10, fill: axisColor }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickCount={4}
          />
          {targetValue !== undefined && (
            <ReferenceLine
              y={targetValue}
              stroke={COLORS.target}
              strokeDasharray="4 4"
              strokeWidth={1}
              strokeOpacity={0.6}
            />
          )}
          <Tooltip
            content={(props) => (
              <ChartTooltip {...props} unit={unit} metricLabel={label} />
            )}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#grad-${dataKey})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 1.5 }}
            animationDuration={400}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HistoryPage() {
  const { history, exportAsCsv } = useTelemetryStream();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const axisColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <Stack gap="md" p={{ base: "xs", sm: "md" }}>
      <Group justify="space-between" align="center">
        <Title order={3} fw={700}>
          History
        </Title>
        <ActionIcon
          variant="default"
          size="md"
          onClick={exportAsCsv}
          aria-label="Export CSV"
        >
          <IconDownload size={16} />
        </ActionIcon>
      </Group>

      {history.length === 0 ? (
        <Card padding="xl" radius="lg" withBorder>
          <Stack align="center" gap="sm" py="xl">
            <IconHistory
              size={48}
              stroke={1}
              color="var(--mantine-color-dimmed)"
            />
            <Text c="dimmed" ta="center">
              No telemetry data recorded yet.
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              Data will appear here as the incubator sends readings.
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
          <Card padding="md" radius="lg" withBorder>
            <Title order={5} fw={600} mb="sm">
              Live Charts
            </Title>
            <Stack gap="md">
              <TelemetryMiniChart
                data={history}
                dataKey="temperature"
                color={COLORS.temperature}
                label="Temperature"
                unit="°C"
                domain={[20, 45]}
                targetValue={37.5}
                gridColor={gridColor}
                axisColor={axisColor}
              />
              <TelemetryMiniChart
                data={history}
                dataKey="humidity"
                color={COLORS.humidity}
                label="Humidity"
                unit="%"
                domain={[25, 85]}
                targetValue={55.0}
                gridColor={gridColor}
                axisColor={axisColor}
              />
            </Stack>
          </Card>

          <Card padding="md" radius="lg" withBorder>
            <Title order={5} fw={600} mb="sm">
              Readings
            </Title>
            <Stack gap="xs">
              {[...history].reverse().map((reading, i) => (
                <Group
                  key={`${reading.time}-${i}`}
                  justify="space-between"
                  wrap="nowrap"
                  py={4}
                  style={{
                    borderBottom:
                      i < history.length - 1
                        ? "1px solid var(--mantine-color-default-border)"
                        : undefined,
                  }}
                >
                  <Text
                    size="xs"
                    c="dimmed"
                    fw={500}
                    ff="monospace"
                    style={{ flexShrink: 0 }}
                  >
                    {reading.time}
                  </Text>
                  <Group gap={6} wrap="nowrap">
                    <Badge size="sm" variant="light" color="teal" ff="monospace">
                      {reading.temperature.toFixed(1)}°C
                    </Badge>
                    <Badge size="sm" variant="light" color="blue" ff="monospace">
                      {reading.humidity.toFixed(1)}%
                    </Badge>
                    <Badge size="sm" variant="light" color="orange" ff="monospace">
                      💡{reading.lampDuty.toFixed(0)}%
                    </Badge>
                    <Badge size="sm" variant="light" color="cyan" ff="monospace">
                      🌀{reading.fanDuty.toFixed(0)}%
                    </Badge>
                  </Group>
                </Group>
              ))}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}
