import {
  Card,
  Group,
  Text,
  Badge,
  Button,
  SimpleGrid,
  Stack,
  Switch,
} from "@mantine/core";
import { EggRegular, PlayCircleRegular, Refresh2Regular, StopCircleRegular } from "@mingcute/react/core-regular";
import { useIncubation, phaseLabel } from "../../hooks/useIncubation";
import { SectionHeader } from "./SectionHeader";

export function IncubationCard() {
  const { deviceId, incubation, busy, start, stop, testTurner, setModeAuto } =
    useIncubation();
  const phase = incubation
    ? phaseLabel(incubation.hari_ke, incubation.mode_auto)
    : null;

  return (
    <Card>
      <SectionHeader
        icon={<EggRegular size={18} />}
        title="Incubation"
        trailing={
          phase ? (
            <Badge color={phase.color} variant="light" size="sm" tt="none">
              {phase.label}
            </Badge>
          ) : undefined
        }
      />

      {incubation ? (
        <SimpleGrid cols={{ base: 3 }} spacing="sm" mb="sm">
          <Stack gap={0}>
            <Text size="xs" c="dimmed">Day</Text>
            <Text size="lg" fw={700} ff="monospace">{incubation.hari_ke}</Text>
          </Stack>
          <Stack gap={0}>
            <Text size="xs" c="dimmed">Target</Text>
            <Text size="lg" fw={700} ff="monospace">
              {incubation.target_suhu.toFixed(1)}°C
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text size="xs" c="dimmed">PID</Text>
            <Text size="sm" fw={600} ff="monospace">
              {incubation.kp.toFixed(1)}/{incubation.ki.toFixed(1)}/
              {incubation.kd.toFixed(1)}
            </Text>
          </Stack>
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed" mb="sm">
          {deviceId ? "Loading incubation state…" : "Waiting for device stream…"}
        </Text>
      )}

      <SimpleGrid cols={{ base: 2 }} spacing="xs" mb="xs">
        <Button
          size="sm"
          color="brand"
          leftSection={<PlayCircleRegular size={18} />}
          onClick={start}
          loading={busy === "start"}
          disabled={!deviceId}
        >
          Start
        </Button>
        <Button
          size="sm"
          color="red"
          variant="light"
          leftSection={<StopCircleRegular size={18} />}
          onClick={stop}
          loading={busy === "stop"}
          disabled={!deviceId}
        >
          Stop
        </Button>
      </SimpleGrid>
      <Group justify="space-between" wrap="nowrap">
        <Button
          size="sm"
          variant="subtle"
          leftSection={<Refresh2Regular size={18} />}
          onClick={testTurner}
          loading={busy === "turner"}
          disabled={!deviceId}
        >
          Test turner
        </Button>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" c="dimmed">Auto</Text>
          <Switch
            size="md"
            checked={(incubation?.mode_auto ?? 1) === 1}
            disabled={!deviceId}
            onChange={(e) => setModeAuto(e.currentTarget.checked)}
          />
        </Group>
      </Group>
    </Card>
  );
}
