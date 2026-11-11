import { useState, useCallback, useEffect } from "react";
import {
  Stack,
  Title,
  Card,
  NumberInput,
  Button,
  Group,
  Text,
  Switch,
  Divider,
  Accordion,
  SimpleGrid,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconDeviceFloppy,
  IconMoon,
  IconSun,
  IconAdjustments,
  IconRefresh,
} from "@tabler/icons-react";
import { IncubationCard } from "../components/dashboard";
import { useIncubation } from "../hooks/useIncubation";
import { useAuth } from "../contexts/AuthContext";

interface PidProfiles {
  target_suhu_set: number;
  target_suhu_hatch: number;
  kp_set: number;
  ki_set: number;
  kd_set: number;
  kp_hatch: number;
  ki_hatch: number;
  kd_hatch: number;
}

interface SettingsState {
  targetHumidity: number;
  humidKp: number;
  humidKi: number;
  humidKd: number;
  turnIntervalHrs: number;
  turnAngle: number;
}

export function SettingsPage() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { apiFetch } = useAuth();
  const { deviceId, incubation, refresh } = useIncubation();

  const [profiles, setProfiles] = useState<PidProfiles>({
    target_suhu_set: 37.8,
    target_suhu_hatch: 37.2,
    kp_set: 25.0,
    ki_set: 1.0,
    kd_set: 5.0,
    kp_hatch: 30.0,
    ki_hatch: 1.5,
    kd_hatch: 2.0,
  });
  const [settings, setSettings] = useState<SettingsState>({
    targetHumidity: 55.0,
    humidKp: 1.5,
    humidKi: 0.3,
    humidKd: 0.5,
    turnIntervalHrs: 4,
    turnAngle: 90,
  });
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!incubation) return;
    setProfiles({
      target_suhu_set: incubation.target_suhu_set,
      target_suhu_hatch: incubation.target_suhu_hatch,
      kp_set: incubation.kp_set,
      ki_set: incubation.ki_set,
      kd_set: incubation.kd_set,
      kp_hatch: incubation.kp_hatch,
      ki_hatch: incubation.ki_hatch,
      kd_hatch: incubation.kd_hatch,
    });
  }, [incubation]);

  const updateProfiles = useCallback((key: keyof PidProfiles, val: number | string) => {
    if (typeof val !== "number") return;
    setProfiles((prev) => ({ ...prev, [key]: val }));
  }, []);

  const update = useCallback((key: keyof SettingsState, val: number | string) => {
    if (typeof val !== "number") return;
    setSettings((prev) => ({ ...prev, [key]: val }));
  }, []);

  const saveProfiles = useCallback(() => {
    if (!deviceId) return;
    setSaving("profiles");
    apiFetch(`/api/device/${deviceId}/incubation/profiles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tss: profiles.target_suhu_set,
        tsh: profiles.target_suhu_hatch,
        kps: profiles.kp_set,
        kis: profiles.ki_set,
        kds: profiles.kd_set,
        kph: profiles.kp_hatch,
        kih: profiles.ki_hatch,
        kdh: profiles.kd_hatch,
      }),
    })
      .catch(() => {})
      .finally(() => {
        setSaving(null);
        refresh();
      });
  }, [deviceId, profiles, refresh]);

  const saveSettings = useCallback(() => {
    if (!deviceId) return;
    setSaving("settings");
    apiFetch(`/api/device/${deviceId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetHumidity: settings.targetHumidity,
        humidKp: settings.humidKp,
        humidKi: settings.humidKi,
        humidKd: settings.humidKd,
        turnIntervalHrs: settings.turnIntervalHrs,
        turnAngle: settings.turnAngle,
      }),
    })
      .catch(() => {})
      .finally(() => {
        setSaving(null);
        refresh();
      });
  }, [deviceId, settings, refresh]);

  return (
    <Stack gap="md" p={{ base: "xs", sm: "md" }}>
      <Group justify="space-between" align="center">
        <Title order={3} fw={700}>
          Settings
        </Title>
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconRefresh size={14} />}
          onClick={() => refresh()}
          disabled={!deviceId}
        >
          Refresh
        </Button>
      </Group>

      <IncubationCard />

      <Card padding="md" radius="lg" withBorder>
        <Group gap="xs" mb="xs">
          <IconAdjustments size={18} stroke={1.5} />
          <Text size="sm" fw={700}>
            PID Profiles (Setter / Hatcher)
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mb="md">
          Setter applies on days 1–18, Hatcher on day 19+. Active gains follow the phase automatically.
        </Text>
        <Text size="xs" c="dimmed" fw={600} mb="xs">
          Setter (H-1…H-18)
        </Text>
        <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs" mb="md">
          <NumberInput
            label="Target (°C)"
            value={profiles.target_suhu_set}
            onChange={(v) => updateProfiles("target_suhu_set", v)}
            decimalScale={1}
            step={0.1}
            min={20}
            max={45}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
          <NumberInput
            label="Kp"
            value={profiles.kp_set}
            onChange={(v) => updateProfiles("kp_set", v)}
            decimalScale={1}
            step={0.5}
            min={0}
            max={100}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
          <NumberInput
            label="Ki"
            value={profiles.ki_set}
            onChange={(v) => updateProfiles("ki_set", v)}
            decimalScale={1}
            step={0.1}
            min={0}
            max={20}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
          <NumberInput
            label="Kd"
            value={profiles.kd_set}
            onChange={(v) => updateProfiles("kd_set", v)}
            decimalScale={1}
            step={0.5}
            min={0}
            max={50}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
        </SimpleGrid>
        <Divider mb="md" />
        <Text size="xs" c="dimmed" fw={600} mb="xs">
          Hatcher (H-19+)
        </Text>
        <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs" mb="md">
          <NumberInput
            label="Target (°C)"
            value={profiles.target_suhu_hatch}
            onChange={(v) => updateProfiles("target_suhu_hatch", v)}
            decimalScale={1}
            step={0.1}
            min={20}
            max={45}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
          <NumberInput
            label="Kp"
            value={profiles.kp_hatch}
            onChange={(v) => updateProfiles("kp_hatch", v)}
            decimalScale={1}
            step={0.5}
            min={0}
            max={100}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
          <NumberInput
            label="Ki"
            value={profiles.ki_hatch}
            onChange={(v) => updateProfiles("ki_hatch", v)}
            decimalScale={1}
            step={0.1}
            min={0}
            max={20}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
          <NumberInput
            label="Kd"
            value={profiles.kd_hatch}
            onChange={(v) => updateProfiles("kd_hatch", v)}
            decimalScale={1}
            step={0.5}
            min={0}
            max={50}
            size="xs"
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
        </SimpleGrid>
        <Button
          fullWidth
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={saveProfiles}
          loading={saving === "profiles"}
          disabled={!deviceId}
        >
          Save PID Profiles
        </Button>
      </Card>

      <Accordion
        variant="separated"
        radius="lg"
        chevronPosition="left"
        styles={{
          item: { overflow: "hidden" },
          control: { borderRadius: "var(--mantine-radius-lg)" },
        }}
      >
        <Accordion.Item value="env">
          <Accordion.Control
            icon={<IconAdjustments size={18} stroke={1.5} />}
          >
            <Text size="sm" fw={600}>
              Humidity & Turning
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                <NumberInput
                  label="Target Humidity (%)"
                  value={settings.targetHumidity}
                  onChange={(v) => update("targetHumidity", v)}
                  decimalScale={1}
                  step={1}
                  min={30}
                  max={90}
                  hideControls
                />
              </SimpleGrid>
              <Text size="xs" c="dimmed">
                Humidity PID
              </Text>
              <SimpleGrid cols={{ base: 3 }} spacing="xs">
                <NumberInput
                  label="Kp"
                  value={settings.humidKp}
                  onChange={(v) => update("humidKp", v)}
                  decimalScale={2}
                  step={0.1}
                  min={0}
                  max={20}
                  size="xs"
                  hideControls
                  styles={{ input: { fontFamily: "var(--font-mono)" } }}
                />
                <NumberInput
                  label="Ki"
                  value={settings.humidKi}
                  onChange={(v) => update("humidKi", v)}
                  decimalScale={2}
                  step={0.05}
                  min={0}
                  max={10}
                  size="xs"
                  hideControls
                  styles={{ input: { fontFamily: "var(--font-mono)" } }}
                />
                <NumberInput
                  label="Kd"
                  value={settings.humidKd}
                  onChange={(v) => update("humidKd", v)}
                  decimalScale={2}
                  step={0.1}
                  min={0}
                  max={20}
                  size="xs"
                  hideControls
                  styles={{ input: { fontFamily: "var(--font-mono)" } }}
                />
              </SimpleGrid>
              <Divider />
              <SimpleGrid cols={{ base: 2 }} spacing="sm">
                <NumberInput
                  label="Turn Interval (hours)"
                  value={settings.turnIntervalHrs}
                  onChange={(v) => update("turnIntervalHrs", v)}
                  step={1}
                  min={1}
                  max={24}
                  size="xs"
                  hideControls
                  styles={{ input: { fontFamily: "var(--font-mono)" } }}
                />
                <NumberInput
                  label="Turn Angle (°)"
                  value={settings.turnAngle}
                  onChange={(v) => update("turnAngle", v)}
                  step={5}
                  min={15}
                  max={180}
                  size="xs"
                  hideControls
                  styles={{ input: { fontFamily: "var(--font-mono)" } }}
                />
              </SimpleGrid>
              <Button
                fullWidth
                variant="light"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={saveSettings}
                loading={saving === "settings"}
                disabled={!deviceId}
              >
                Save Humidity & Turning
              </Button>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Card padding="md" radius="lg" withBorder>
        <Text size="sm" fw={700} mb="md">
          Appearance
        </Text>
        <Group justify="space-between">
          <Group gap="xs">
            {colorScheme === "dark" ? (
              <IconMoon size={16} stroke={1.5} />
            ) : (
              <IconSun size={16} stroke={1.5} />
            )}
            <Text size="sm">Dark Mode</Text>
          </Group>
          <Switch
            checked={colorScheme === "dark"}
            onChange={toggleColorScheme}
            size="md"
          />
        </Group>
      </Card>

      <Card padding="md" radius="lg" withBorder>
        <Text size="sm" fw={700} mb="xs">
          Device Info
        </Text>
        <Divider mb="sm" />
        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Device ID</Text>
            <Text size="xs" ff="monospace">{deviceId ?? "—"}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Cycle Start</Text>
            <Text size="xs" ff="monospace">
              {incubation && incubation.waktu_mulai > 0
                ? new Date(incubation.waktu_mulai * 1000).toLocaleString()
                : "—"}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Firmware</Text>
            <Text size="xs" ff="monospace">v0.1.0</Text>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
