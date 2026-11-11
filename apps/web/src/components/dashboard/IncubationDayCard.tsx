import { Card, Group, Text, Stack, ThemeIcon, Box, Badge } from "@mantine/core";
import { IconEgg } from "@tabler/icons-react";
import { motion } from "framer-motion";

interface IncubationDayCardProps {
  readonly hariKe: number;
  readonly modeAuto: number;
}

const cardVariant = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function IncubationDayCard({ hariKe, modeAuto }: IncubationDayCardProps) {
  const running = hariKe > 0;
  const phaseName =
    !running ? "STANDBY" : modeAuto === 1 && hariKe >= 19 ? "HATCHER" : "SETTER";
  const phaseColor = !running
    ? "gray"
    : modeAuto !== 1
      ? "blue"
      : hariKe >= 19
        ? "orange"
        : "teal";

  return (
    <motion.div variants={cardVariant} style={{ height: "100%" }}>
      <Card
        className="stat-card"
        padding="md"
        radius="lg"
        withBorder
        h="100%"
      >
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon
            variant="light"
            color={phaseColor === "gray" ? "gray" : "violet"}
            size={42}
            radius="lg"
            style={{ flexShrink: 0 }}
          >
            <IconEgg size={18} stroke={1.5} />
          </ThemeIcon>

          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" truncate>
              Incubation
            </Text>
            <Text size="xl" fw={800} lh={1} ff="monospace" truncate>
              {running ? `H-${hariKe}` : "H-0"}
            </Text>
            <Box mt={2}>
              <Badge
                color={phaseColor}
                variant="light"
                size="sm"
                tt="uppercase"
                styles={{ label: { fontFamily: "var(--font-mono)" } }}
              >
                {phaseName}
              </Badge>
              <Text
                size="xs"
                c="dimmed"
                ff="monospace"
                mt={4}
                style={{ display: "block" }}
              >
                Mode: {modeAuto === 1 ? "Auto" : "Manual"}
              </Text>
            </Box>
          </Stack>
        </Group>
      </Card>
    </motion.div>
  );
}
