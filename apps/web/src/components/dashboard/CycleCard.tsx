import { Badge, Box, Card, Group, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import { EggRegular } from "@mingcute/react/core-regular";
import { motion } from "framer-motion";
import { riseIn } from "../../lib/motion";
import { HATCHER_START_DAY } from "../../hooks/useIncubation";
import { useNow } from "../../hooks/useNow";
import { formatElapsed } from "../../lib/time";
import { SectionHeader } from "./SectionHeader";

interface CycleCardProps {
  readonly hariKe: number;
  readonly modeAuto: number;
  /** Unix seconds the cycle started, 0 when there is no cycle. */
  readonly startedAt: number;
  readonly targetTemp: number | null;
}

const REDRAW_MS = 30000;

export function CycleCard({ hariKe, modeAuto, startedAt, targetTemp }: CycleCardProps) {
  const now = useNow(REDRAW_MS);
  const running = hariKe > 0;
  const hatcher = running && modeAuto === 1 && hariKe >= HATCHER_START_DAY;
  const daysToHatcher = Math.max(0, HATCHER_START_DAY - hariKe);
  const progress = Math.min(100, (hariKe / HATCHER_START_DAY) * 100);
  const elapsed = startedAt > 0 ? formatElapsed(now - startedAt * 1000) : null;

  const caption = !running
    ? "No cycle yet. Start one in Settings."
    : hatcher
      ? "Hatcher phase active"
      : `Hatcher phase in ${daysToHatcher} day${daysToHatcher === 1 ? "" : "s"}`;

  return (
    <motion.div variants={riseIn} style={{ height: "100%" }}>
      <Card className="stat-card" h="100%">
        <SectionHeader
          icon={<EggRegular size={18} />}
          title="Incubation"
          trailing={
            <Badge size="sm" variant="light" color={modeAuto === 1 ? "sage" : "amber"} radius="xl">
              {modeAuto === 1 ? "Auto" : "Manual"}
            </Badge>
          }
        />

        <Group gap={8} align="baseline" wrap="nowrap">
          <Text size="2rem" fw={800} lh={1.1} ff="monospace">
            {running ? `Day ${hariKe}` : "Idle"}
          </Text>
          {hatcher && (
            <Badge size="sm" variant="filled" color="amber" radius="xl">
              hatcher
            </Badge>
          )}
        </Group>

        <Box mt="sm">
          <Progress
            value={progress}
            color={hatcher ? "amber.5" : "sage.6"}
            size={6}
            radius="xl"
            transitionDuration={300}
            aria-label="Progress to the hatcher phase"
          />
          <Text size="xs" c="dimmed" mt={6}>
            {caption}
          </Text>
        </Box>

        <SimpleGrid cols={2} spacing="sm" mt="md">
          <Stack gap={0}>
            <Text size="xs" c="dimmed">
              Elapsed
            </Text>
            <Text size="sm" fw={600} ff="monospace" truncate>
              {elapsed ?? "—"}
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text size="xs" c="dimmed">
              Target
            </Text>
            <Text size="sm" fw={600} ff="monospace" truncate>
              {targetTemp ? `${targetTemp.toFixed(1)}°C` : "—"}
            </Text>
          </Stack>
        </SimpleGrid>
      </Card>
    </motion.div>
  );
}
