import { useState, useCallback } from "react";
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
  IconRotateClockwise2,
} from "@tabler/icons-react";

interface SettingsState {
  targetTemp: number;
  targetHumidity: number;
  tempKp: number;
  tempKi: number;
  tempKd: number;
  humidKp: number;
  humidKi: number;
  humidKd: number;
  turnIntervalHrs: number;
  turnAngle: number;
}

export function SettingsPage() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const [settings, setSettings] = useState<SettingsState>({
    targetTemp: 37.5,
    targetHumidity: 55.0,
    tempKp: 2.0,
    tempKi: 0.5,
    tempKd: 1.0,
    humidKp: 1.5,
    humidKi: 0.3,
    humidKd: 0.5,
    turnIntervalHrs: 4,
    turnAngle: 90,
  });

  const update = useCallback(
    (key: keyof SettingsState, val: number | string) => {
      setSettings((prev) => ({
        ...prev,
        [key]: typeof val === "number" ? val : prev[key],
      }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    // TODO: Wire to PUT /api/device/:id/settings
    console.info("Saving settings:", settings);
  }, [settings]);

  return (
    <Stack gap="md" p={{ base: "xs", sm: "md" }}>
      <Title order={3} fw={700}>
        Settings
      </Title>

      <Card padding="md" radius="lg" withBorder>
        <Text size="sm" fw={700} mb="md">
          Incubation Targets
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          <NumberInput
            label="Target Temperature (°C)"
            value={settings.targetTemp}
            onChange={(v) => update("targetTemp", v)}
            decimalScale={1}
            step={0.1}
            min={20}
            max={45}
            hideControls
          />
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
        <Button
          fullWidth
          mt="md"
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={handleSave}
        >
          Save Targets
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
        <Accordion.Item value="pid">
          <Accordion.Control
            icon={<IconAdjustments size={18} stroke={1.5} />}
          >
            <Text size="sm" fw={600}>
              Advanced PID Tuning
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                Temperature PID
              </Text>
              <SimpleGrid cols={{ base: 3 }} spacing="xs">
                <NumberInput
                  label="Kp"
                  value={settings.tempKp}
                  onChange={(v) => update("tempKp", v)}
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
                  value={settings.tempKi}
                  onChange={(v) => update("tempKi", v)}
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
                  value={settings.tempKd}
                  onChange={(v) => update("tempKd", v)}
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

              <Button
                fullWidth
                variant="light"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={handleSave}
              >
                Save PID Gains
              </Button>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="servo">
          <Accordion.Control
            icon={<IconRotateClockwise2 size={18} stroke={1.5} />}
          >
            <Text size="sm" fw={600}>
              Egg Turning
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
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
              mt="md"
              variant="light"
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={handleSave}
            >
              Save Turn Config
            </Button>
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
            <Text size="xs" ff="monospace">482-911</Text>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">MAC Address</Text>
            <Text size="xs" ff="monospace">AA:BB:CC:DD:EE:FF</Text>
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
