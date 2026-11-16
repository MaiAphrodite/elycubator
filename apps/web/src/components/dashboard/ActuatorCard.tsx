import { useEffect, useRef, useState } from "react";
import { Box, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { BulbRegular, FanRegular, Refresh2Regular } from "@mingcute/react/core-regular";
import { motion } from "framer-motion";
import { DURATION, EASE } from "../../lib/motion";

interface ActuatorCardProps {
  readonly lampDuty: number;
  readonly fanDuty: number;
  readonly servoAngle: number;
  readonly lampEnabled: boolean;
  readonly fanEnabled: boolean;
  readonly onToggleLamp: () => void;
  readonly onToggleFan: () => void;
  readonly onTriggerServo: () => void;
  readonly lampHistory: readonly number[];
  readonly fanHistory: readonly number[];
  readonly turnIntervalHrs: number | null;
  readonly turnAngle: number | null;
}

const BAR_COUNT = 24;
const TURN_FEEDBACK_MS = 3000;

const tileMotion = {
  whileTap: { scale: 0.98 },
  transition: { duration: DURATION.press, ease: EASE.press },
};

/** Last duty samples as a stepped band, oldest left, newest right. */
function DutyBars({ samples, color }: { readonly samples: readonly number[]; readonly color: string }) {
  const shown = samples.slice(-BAR_COUNT);

  return (
    <Group gap={2} align="flex-end" h={30} mt="md" wrap="nowrap" aria-hidden>
      {shown.length === 0 ? (
        <Box
          style={{
            height: 3,
            width: "100%",
            borderRadius: 2,
            backgroundColor: "var(--mantine-color-default-border)",
          }}
        />
      ) : (
        shown.map((value, index) => (
          <Box
            key={index}
            style={{
              flex: 1,
              minWidth: 2,
              height: `${Math.max(8, Math.min(100, value))}%`,
              borderRadius: 2,
              backgroundColor: `var(--mantine-color-${color}-4)`,
              opacity: 0.3 + 0.55 * (index / Math.max(1, shown.length - 1)),
            }}
          />
        ))
      )}
    </Group>
  );
}

interface ArmTileProps {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly color: string;
  readonly enabled: boolean;
  readonly duty: number;
  readonly history: readonly number[];
  readonly onToggle: () => void;
}

/**
 * The whole tile is the control, so the target is thumb sized and there is no
 * small switch parked at the edge. The switch is permission, the percentage is
 * what the controller is driving right now, which is why an on lamp can show 0%.
 */
function ArmTile({ label, icon, color, enabled, duty, history, onToggle }: ArmTileProps) {
  const output = enabled ? Math.round(duty) : 0;
  const detail = !enabled ? "Off" : output > 0 ? `On · ${output}%` : "On · idle";

  return (
    <motion.div {...tileMotion} style={{ height: "100%" }}>
      <UnstyledButton
        role="switch"
        aria-checked={enabled}
        aria-label={`${label}, ${enabled ? "on" : "off"}, output ${output} percent`}
        onClick={onToggle}
        className="tile"
        h="100%"
        w="100%"
        p="md"
        style={{
          display: "block",
          borderRadius: "var(--mantine-radius-lg)",
          border: `1px solid ${
            enabled
              ? `color-mix(in srgb, var(--mantine-color-${color}-5) 26%, var(--mantine-color-body))`
              : "var(--mantine-color-default-border)"
          }`,
          backgroundColor: enabled
            ? `color-mix(in srgb, var(--mantine-color-${color}-5) 9%, var(--mantine-color-body))`
            : "var(--mantine-color-body)",
        }}
      >
        <Group gap="sm" wrap="nowrap" align="center">
          <ThemeIcon
            variant="light"
            color={enabled ? color : "gray"}
            size={40}
            radius="md"
            style={{ flexShrink: 0 }}
          >
            {icon}
          </ThemeIcon>
          <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={700} lh={1.1} truncate>
              {label}
            </Text>
            <Text size="xs" c={enabled ? undefined : "dimmed"} ff="monospace" lh={1.2} truncate>
              {detail}
            </Text>
          </Stack>
        </Group>
        <DutyBars samples={enabled ? history : []} color={enabled ? color : "gray"} />
      </UnstyledButton>
    </motion.div>
  );
}

function TurnerBar({
  servoAngle,
  turnIntervalHrs,
  turnAngle,
  onTrigger,
}: {
  readonly servoAngle: number;
  readonly turnIntervalHrs: number | null;
  readonly turnAngle: number | null;
  readonly onTrigger: () => void;
}) {
  const [turning, setTurning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handle = () => {
    onTrigger();
    setTurning(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTurning(false), TURN_FEEDBACK_MS);
  };

  const schedule =
    turnIntervalHrs && turnAngle
      ? `every ${turnIntervalHrs}h to ${turnAngle}°`
      : "interval not set";

  return (
    <motion.div {...tileMotion}>
      <UnstyledButton
        onClick={handle}
        aria-label={`Turn the eggs now, servo currently at ${servoAngle} degrees`}
        className="tile"
        w="100%"
        p="md"
        style={{
          display: "block",
          borderRadius: "var(--mantine-radius-lg)",
          border: "1px solid color-mix(in srgb, var(--mantine-color-brand-8) 38%, var(--mantine-color-body))",
          backgroundColor: "color-mix(in srgb, var(--mantine-color-brand-5) 26%, var(--mantine-color-body))",
        }}
      >
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="brand" size={40} radius="md">
              <motion.span
                style={{ display: "flex" }}
                animate={{ rotate: turning ? 360 : servoAngle }}
                transition={
                  turning
                    ? { repeat: Infinity, duration: 1.4, ease: "linear" }
                    : { type: "spring", duration: 0.45, bounce: 0.2 }
                }
                aria-hidden
              >
                <Refresh2Regular size={22} />
              </motion.span>
            </ThemeIcon>
            <Stack gap={1} style={{ minWidth: 0 }}>
              <Text size="sm" fw={700} lh={1.1}>
                {turning ? "Turning…" : "Turn now"}
              </Text>
              <Text size="xs" c="dimmed" ff="monospace" lh={1.2} truncate>
                {schedule}
              </Text>
            </Stack>
          </Group>
          <Text ff="monospace" fw={800} size="lg" style={{ flexShrink: 0 }}>
            {servoAngle}°
          </Text>
        </Group>
      </UnstyledButton>
    </motion.div>
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
  lampHistory,
  fanHistory,
  turnIntervalHrs,
  turnAngle,
}: ActuatorCardProps) {
  return (
    <Card>
      <Group justify="space-between" mb="sm">
        <Text size="sm" fw={700}>
          Actuators
        </Text>
        <Text size="xs" c="dimmed">
          tap to switch on or off
        </Text>
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <ArmTile
          label="Lamp"
          icon={<BulbRegular size={22} />}
          color="amber"
          enabled={lampEnabled}
          duty={lampDuty}
          history={lampHistory}
          onToggle={onToggleLamp}
        />
        <ArmTile
          label="Fan"
          icon={<FanRegular size={22} />}
          color="sage"
          enabled={fanEnabled}
          duty={fanDuty}
          history={fanHistory}
          onToggle={onToggleFan}
        />
      </SimpleGrid>

      <Box mt="sm">
        <TurnerBar
          servoAngle={servoAngle}
          turnIntervalHrs={turnIntervalHrs}
          turnAngle={turnAngle}
          onTrigger={onTriggerServo}
        />
      </Box>

      <Text size="xs" c="dimmed" mt="sm">
        The switch turns the output on or off. The percentage is what the controller is driving now.
      </Text>
    </Card>
  );
}
