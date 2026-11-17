import { Badge, Card, Divider, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { Filter2Regular } from "@mingcute/react/core-regular";
import { SectionHeader } from "./SectionHeader";

export interface GainProfile {
  readonly kp: number;
  readonly ki: number;
  readonly kd: number;
  readonly target: number;
}

interface ControlLoopCardProps {
  readonly kp: number | null;
  readonly ki: number | null;
  readonly kd: number | null;
  readonly modeAuto: number;
  readonly hatcherActive: boolean;
  readonly setter: GainProfile | null;
  readonly hatcher: GainProfile | null;
}

function formatGains(profile: GainProfile | null): string {
  if (!profile) return "—";
  return `${profile.kp.toFixed(1)} / ${profile.ki.toFixed(1)} / ${profile.kd.toFixed(1)}`;
}

function ProfileRow({
  title,
  profile,
  active,
}: {
  readonly title: string;
  readonly profile: GainProfile | null;
  readonly active: boolean;
}) {
  return (
    <Stack gap={2}>
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed" fw={active ? 700 : 400}>
          {title}
        </Text>
        {active && (
          <Badge size="xs" variant="light" color="sage" radius="xl" tt="none">
            active
          </Badge>
        )}
      </Group>
      <Text size="sm" fw={active ? 700 : 500} ff="monospace" truncate>
        {formatGains(profile)}
      </Text>
      <Text size="xs" c="dimmed" ff="monospace">
        {profile ? `${profile.target.toFixed(1)}°C` : "—"}
      </Text>
    </Stack>
  );
}

/** Active PID gains plus both stored profiles, so the numbers have a source. */
export function ControlLoopCard({
  kp,
  ki,
  kd,
  modeAuto,
  hatcherActive,
  setter,
  hatcher,
}: ControlLoopCardProps) {
  const gains = [
    { label: "Kp", value: kp },
    { label: "Ki", value: ki },
    { label: "Kd", value: kd },
  ];

  return (
    <Card h="100%">
      <SectionHeader
        icon={<Filter2Regular size={18} />}
        title="Kontrol PID"
        trailing={
          <Badge size="sm" variant="light" color={modeAuto === 1 ? "sage" : "amber"} radius="xl">
            {modeAuto === 1 ? "Auto" : "Manual"}
          </Badge>
        }
      />

      <SimpleGrid cols={3} spacing="sm">
        {gains.map(({ label, value }) => (
          <Stack key={label} gap={0}>
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text size="lg" fw={700} ff="monospace" truncate>
              {value === null ? "—" : value.toFixed(1)}
            </Text>
          </Stack>
        ))}
      </SimpleGrid>

      <Divider my="sm" />

      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
        <ProfileRow title="Setter" profile={setter} active={!hatcherActive} />
        <ProfileRow title="Hatcher" profile={hatcher} active={hatcherActive} />
      </SimpleGrid>
    </Card>
  );
}
