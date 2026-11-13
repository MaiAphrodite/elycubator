import {
  Stack,
  Group,
  Title,
  Text,
  ActionIcon,
  SimpleGrid,
} from "@mantine/core";
import {
  IconActivity,
  IconDownload,
  IconDroplet,
  IconTemperature,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { StatCard, ActuatorCard, IncubationDayCard } from "../components/dashboard";
import { useTelemetryStream } from "../hooks/useTelemetryStream";
import { useIncubation } from "../hooks/useIncubation";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

export function DashboardPage() {
  const {
    current,
    history,
    lampEnabled,
    fanEnabled,
    setLampEnabled,
    setFanEnabled,
    triggerServo,
    exportAsCsv,
  } = useTelemetryStream();
  const { incubation } = useIncubation();

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <Stack gap="md" p={{ base: "xs", sm: "md" }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Title order={3} fw={700} lh={1.2}>
              Pinkegg
            </Title>
            <Group gap={4} wrap="nowrap">
              <IconActivity
                size={12}
                stroke={1.5}
                color="var(--mantine-color-dimmed)"
              />
              <Text size="xs" c="dimmed" ff="monospace" truncate>
                {current.time}
              </Text>
            </Group>
          </Stack>
          <ActionIcon
            variant="default"
            size="md"
            onClick={exportAsCsv}
            aria-label="Export CSV"
          >
            <IconDownload size={16} />
          </ActionIcon>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <StatCard
            label="Temperature"
            value={`${current.temperature.toFixed(1)}°C`}
            subtitle={`Target: ${(incubation?.target_suhu ?? 37.5).toFixed(1)}°C`}
            icon={<IconTemperature size={18} stroke={1.5} />}
            color="teal"
            sparklineData={history}
            sparklineKey="temperature"
            sparklineDomain={[20, 45]}
          />
          <StatCard
            label="Humidity"
            value={`${current.humidity.toFixed(1)}%`}
            subtitle="Target: 55.0%"
            icon={<IconDroplet size={18} stroke={1.5} />}
            color="blue"
            sparklineData={history}
            sparklineKey="humidity"
            sparklineDomain={[25, 85]}
          />
          <IncubationDayCard
            hariKe={incubation?.hari_ke ?? 0}
            modeAuto={incubation?.mode_auto ?? 0}
          />
        </SimpleGrid>

        <ActuatorCard
          lampDuty={current.lampDuty}
          fanDuty={current.fanDuty}
          servoAngle={current.servoAngle}
          lampEnabled={lampEnabled}
          fanEnabled={fanEnabled}
          onToggleLamp={() => setLampEnabled(!lampEnabled)}
          onToggleFan={() => setFanEnabled(!fanEnabled)}
          onTriggerServo={triggerServo}
        />
      </Stack>
    </motion.div>
  );
}
