import {
  Card,
  Group,
  Text,
  Stack,
  Switch,
  ActionIcon,
  Progress,
  Box,
  Badge,
} from "@mantine/core";
import {
  IconBulb,
  IconPropeller,
  IconRotateClockwise2,
} from "@tabler/icons-react";
import { motion } from "framer-motion";

interface ActuatorCardProps {
  readonly lampDuty: number;
  readonly fanDuty: number;
  readonly servoAngle: number;
  readonly lampEnabled: boolean;
  readonly fanEnabled: boolean;
  readonly onToggleLamp: () => void;
  readonly onToggleFan: () => void;
  readonly onTriggerServo: () => void;
}

const cardVariant = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function ActuatorRow({
  icon,
  label,
  duty,
  enabled,
  color,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  duty: number;
  enabled: boolean;
  color: string;
  onToggle: () => void;
}) {
  const displayDuty = enabled ? Math.round(duty) : 0;

  return (
    <Group gap="sm" wrap="nowrap" py={6}>
      <Box
        style={{
          width: 36,
          height: 36,
          borderRadius: "0.75rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: enabled
            ? `var(--mantine-color-${color}-light)`
            : "var(--mantine-color-dark-6)",
          color: enabled
            ? `var(--mantine-color-${color}-filled)`
            : "var(--mantine-color-dimmed)",
          transition: "all 200ms ease",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>

      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={600}>
            {label}
          </Text>
          <Text size="xs" ff="monospace" fw={600} c={enabled ? color : "dimmed"}>
            {displayDuty}%
          </Text>
        </Group>
        <Progress
          value={displayDuty}
          color={enabled ? color : "gray"}
          size={4}
          radius="xl"
          animated={enabled && displayDuty > 0}
        />
      </Stack>

      <Switch
        checked={enabled}
        onChange={onToggle}
        size="sm"
        color={color}
        style={{ flexShrink: 0 }}
      />
    </Group>
  );
}

export function ActuatorCard({
  lampDuty,
  fanDuty,
  servoAngle,
  lampEnabled,
  fanEnabled,
  onToggleLamp,
  onToggleFan,
  onTriggerServo,
}: ActuatorCardProps) {
  return (
    <motion.div variants={cardVariant}>
      <Card padding="md" radius="lg" withBorder>
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={700}>
            Actuators
          </Text>
          <Badge
            size="xs"
            variant="dot"
            color={lampEnabled || fanEnabled ? "green" : "gray"}
          >
            {lampEnabled || fanEnabled ? "Active" : "Idle"}
          </Badge>
        </Group>

        <Stack gap={0}>
          <ActuatorRow
            icon={<IconBulb size={18} stroke={1.5} />}
            label="Lamp"
            duty={lampDuty}
            enabled={lampEnabled}
            color="orange"
            onToggle={onToggleLamp}
          />

          <ActuatorRow
            icon={<IconPropeller size={18} stroke={1.5} />}
            label="Fan"
            duty={fanDuty}
            enabled={fanEnabled}
            color="cyan"
            onToggle={onToggleFan}
          />
        </Stack>

        <Group
          justify="space-between"
          align="center"
          mt="xs"
          pt="xs"
          style={{
            borderTop: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Group gap="xs" wrap="nowrap">
            <IconRotateClockwise2
              size={16}
              stroke={1.5}
              style={{
                color: "var(--mantine-color-indigo-filled)",
                transform: `rotate(${servoAngle}deg)`,
                transition: "transform 300ms ease",
              }}
            />
            <Text size="sm" fw={600}>
              Servo
            </Text>
            <Text size="xs" ff="monospace" c="dimmed">
              {servoAngle}°
            </Text>
          </Group>
          <ActionIcon
            variant="light"
            color="indigo"
            size="md"
            radius="lg"
            onClick={onTriggerServo}
            aria-label="Trigger servo turn"
          >
            <IconRotateClockwise2 size={16} stroke={2} />
          </ActionIcon>
        </Group>
      </Card>
    </motion.div>
  );
}
