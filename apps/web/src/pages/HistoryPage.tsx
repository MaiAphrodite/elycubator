import {
  Stack,
  Text,
  Card,
  Group,
  Badge,
  Button,
  useComputedColorScheme,
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
import {
  ChartLineRegular,
  DownloadRegular,
  HistoryRegular,
  ListCheck2Regular,
} from "@mingcute/react/core-regular";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/dashboard/SectionHeader";
import { useTelemetryStream } from "../hooks/useTelemetryStream";
import type { TelemetryReading } from "../types/telemetry";

const COLORS = {
  temperature: "#C1731F",
  humidity: "#6C8455",
  target: "#A29277",
} as const;

/* The client buffer holds 50 readings at roughly 2s, so the window is about
   100 seconds. Minute-resolution ticks would all read the same, which is why
   the axis keeps seconds and relies on a wide gap instead. */
function axisTime(label: string): string {
  return label;
}

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
  readonly domain: any;
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
          margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: axisColor }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={68}
            tickFormatter={axisTime}
            tickMargin={6}
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 11, fill: axisColor }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickCount={4}
            tickMargin={4}
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
            animationDuration={200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HistoryPage() {
  const { history, exportAsCsv } = useTelemetryStream();
  // useMantineColorScheme() reports "auto" when the user never touched the
  // toggle, which made the chart draw light-mode axis labels on a dark card.
  const colorScheme = useComputedColorScheme("light");
  const isDark = colorScheme === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.13)" : "rgba(56,50,41,0.10)";
  const axisColor = isDark ? "rgba(255,255,255,0.70)" : "rgba(56,50,41,0.66)";

  return (
    <Stack gap="lg" p={{ base: "xs", sm: "md" }}>
      <PageHeader
        title="Riwayat"
        subtitle={`${history.length} readings`}
        actions={
          <Button
            variant="default"
            size="compact-sm"
            leftSection={<DownloadRegular size={16} />}
            onClick={exportAsCsv}
            disabled={history.length === 0}
            aria-label={`Export ${history.length} readings as CSV`}
          >
            {history.length} rows
          </Button>
        }
      />

      {history.length === 0 ? (
        <Card padding="xl">
          <Stack align="center" gap="sm" py="xl">
            <HistoryRegular
              size={48}
              color="var(--mantine-color-dimmed)"
            />
            <Text c="dimmed" ta="center">
              No readings yet.
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              Readings appear here once the incubator sends data.
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
          <Card>
            <SectionHeader
              icon={<ChartLineRegular size={18} />}
              title="Grafik"
              trailing={
                <Text size="xs" c="dimmed">
                  last {history.length} readings
                </Text>
              }
            />
            <Stack gap="md">
              <TelemetryMiniChart
                data={history}
                dataKey="temperature"
                color={COLORS.temperature}
                label="Suhu"
                unit="°C"
                domain={["dataMin - 0.5", "dataMax + 0.5"]}
                targetValue={37.5}
                gridColor={gridColor}
                axisColor={axisColor}
              />
              <TelemetryMiniChart
                data={history}
                dataKey="humidity"
                color={COLORS.humidity}
                label="Kelembapan"
                unit="%"
                domain={["dataMin - 2.0", "dataMax + 2.0"]}
                targetValue={55.0}
                gridColor={gridColor}
                axisColor={axisColor}
              />
            </Stack>
          </Card>

          <Card>
            <SectionHeader
              icon={<ListCheck2Regular size={18} />}
              title="Pembacaan"
              trailing={
                <Text size="xs" c="dimmed" ff="monospace">
                  newest first
                </Text>
              }
            />
            <Stack gap="xs">
              {[...history].reverse().map((reading, i) => (
                <Group
                  key={`${reading.time}-${i}`}
                  justify="space-between"
                  wrap="wrap"
                  gap="xs"
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
                  <Group gap={6} wrap="wrap">
                    <Badge size="sm" variant="light" color="sage" ff="monospace">
                      {reading.temperature.toFixed(1)}°C
                    </Badge>
                    <Badge size="sm" variant="light" color="brand" ff="monospace">
                      {reading.humidity.toFixed(1)}%
                    </Badge>
                    <Badge size="sm" variant="light" color="amber" ff="monospace">
                      💡{reading.lampDuty.toFixed(0)}%
                    </Badge>
                    <Badge size="sm" variant="light" color="sage" ff="monospace">
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
