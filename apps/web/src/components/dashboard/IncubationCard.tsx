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
import {
  IconEgg,
  IconPlayerPlay,
  IconPlayerStop,
  IconRotateClockwise2,
} from "@tabler/icons-react";
import { useIncubation, phaseLabel } from "../../hooks/useIncubation";

export function IncubationCard() {
  const { deviceId, incubation, busy, start, stop, testTurner, setModeAuto } =
    useIncubation();
  const phase = incubation
    ? phaseLabel(incubation.hari_ke, incubation.mode_auto)
    : null;

  return (
    <Card padding="md" radius="lg" withBorder>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconEgg size={18} stroke={1.5} />
          <Text size="sm" fw={700}>
            Incubation
          </Text>
        </Group>
        {phase && (
          <Badge color={phase.color} variant="light" size="sm">
            {phase.label}
          </Badge>
        )}
      </Group>

      {incubation ? (
        <SimpleGrid cols={{ base: 3 }} spacing="sm" mb="sm">
          <Stack gap={0}>
            <Text size="xs" c="dimmed">Hari Ke</Text>
            <Text size="lg" fw={700} ff="monospace">H-{incubation.hari_ke}</Text>
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
          size="xs"
          color="teal"
          leftSection={<IconPlayerPlay size={14} />}
          onClick={start}
          loading={busy === "start"}
          disabled={!deviceId}
        >
          Start
        </Button>
        <Button
          size="xs"
          color="red"
          variant="light"
          leftSection={<IconPlayerStop size={14} />}
          onClick={stop}
          loading={busy === "stop"}
          disabled={!deviceId}
        >
          Stop
        </Button>
      </SimpleGrid>
      <Group justify="space-between" wrap="nowrap">
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconRotateClockwise2 size={14} />}
          onClick={testTurner}
          loading={busy === "turner"}
          disabled={!deviceId}
        >
          Test Turner
        </Button>
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">Auto</Text>
          <Switch
            size="sm"
            checked={(incubation?.mode_auto ?? 1) === 1}
            disabled={!deviceId}
            onChange={(e) => setModeAuto(e.currentTarget.checked)}
          />
        </Group>
      </Group>
    </Card>
  );
}
