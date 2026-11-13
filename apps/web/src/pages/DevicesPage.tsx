import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCircleCheck,
  IconDevices,
  IconInfoCircle,
  IconRefresh,
} from "@tabler/icons-react";
import { useAuth } from "../contexts/AuthContext";
import type { Device, PendingDevice } from "../types/device";

const REFRESH_MS = 10000;

function fmtTime(value: string): string {
  return new Date(value.replace(" ", "T") + "Z").toLocaleString();
}

export function DevicesPage() {
  const { apiFetch } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<PendingDevice[]>([]);
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mine, waiting] = await Promise.all([
      apiFetch("/api/devices"),
      apiFetch("/api/devices/pending"),
    ]).catch(() => [null, null] as const);
    if (mine?.ok) setDevices((await mine.json()).data ?? []);
    if (waiting?.ok) setPending((await waiting.json()).data ?? []);
  }, [apiFetch]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const claimByMac = async (macAddress: string) => {
    setError(null);
    setNote(null);
    const label = window.prompt("Nickname for this device (optional):", "") ?? "";
    setClaiming(true);
    try {
      const res = await apiFetch("/api/device/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macAddress, nickname: label.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || "Claim failed.");
      setNote(`Claimed ${macAddress}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClaiming(false);
    }
  };

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote(null);
    setClaiming(true);
    try {
      const res = await apiFetch("/api/device/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingPin: pin.trim(), nickname: nickname.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || "Claim failed.");
      setNote(`Claimed ${body.data?.macAddress ?? pin.trim()}.`);
      setPin("");
      setNickname("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Stack gap="md" p={{ base: "xs", sm: "md" }}>
      <Group justify="space-between" align="center">
        <Title order={3} fw={700}>
          Devices
        </Title>
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconRefresh size={14} />}
          onClick={() => load()}
        >
          Refresh
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
          {error}
        </Alert>
      )}
      {note && (
        <Alert icon={<IconCircleCheck size={16} />} title="Done" color="green">
          {note}
        </Alert>
      )}

      <Card padding="md" radius="lg" withBorder>
        <Group gap="xs" mb="xs">
          <IconDevices size={18} stroke={1.5} />
          <Text size="sm" fw={700}>
            Add a device
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mb="md">
          Power the incubator and wait for it to connect. Its screen shows a pairing PIN,
          which proves you have physical access to it.
        </Text>
        <form onSubmit={claim}>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" mb="md">
            <TextInput
              label="Pairing PIN"
              placeholder="205026"
              value={pin}
              onChange={(event) => setPin(event.currentTarget.value)}
              maxLength={8}
              inputMode="numeric"
              required
              styles={{ input: { fontFamily: "var(--font-mono)" } }}
            />
            <TextInput
              label="Nickname"
              placeholder="Incubator 1"
              value={nickname}
              onChange={(event) => setNickname(event.currentTarget.value)}
              maxLength={40}
            />
          </SimpleGrid>
          <Button
            fullWidth
            type="submit"
            loading={claiming}
            disabled={pin.trim().length < 4}
            leftSection={<IconCircleCheck size={16} />}
          >
            Claim device
          </Button>
        </form>
      </Card>

      <Card padding="md" radius="lg" withBorder>
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <IconInfoCircle size={18} stroke={1.5} />
            <Text size="sm" fw={700}>
              Waiting to be claimed
            </Text>
          </Group>
          {pending.length > 0 && (
            <Badge color="orange" variant="light" size="sm">
              {pending.length} waiting
            </Badge>
          )}
        </Group>
        <Divider mb="sm" />
        {pending.length === 0 ? (
          <Text size="xs" c="dimmed">
            Nothing waiting. A device appears here once it has registered itself with the server.
          </Text>
        ) : (
          <Stack gap="xs">
            {pending.map((device) => (
              <Group key={device.macAddress} justify="space-between" wrap="nowrap">
                <Stack gap={0}>
                  <Text size="xs" ff="monospace">
                    {device.macAddress}
                  </Text>
                  <Text size="xs" c="dimmed">
                    registered {fmtTime(device.createdAt)}
                  </Text>
                </Stack>
                <Button
                  size="xs"
                  variant="light"
                  loading={claiming}
                  onClick={() => claimByMac(device.macAddress)}
                >
                  Claim
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Card>

      <Card padding="md" radius="lg" withBorder>
        <Group gap="xs" mb="xs">
          <IconCircleCheck size={18} stroke={1.5} />
          <Text size="sm" fw={700}>
            My devices
          </Text>
        </Group>
        <Divider mb="sm" />
        {devices.length === 0 ? (
          <Text size="xs" c="dimmed">
            No devices claimed yet.
          </Text>
        ) : (
          <Stack gap="sm">
            {devices.map((device) => (
              <Stack key={device.id} gap={2}>
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    {device.nickname ?? "Unnamed device"}
                  </Text>
                  <Badge color="green" variant="light" size="sm">
                    claimed
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" ff="monospace">
                    {device.macAddress}
                  </Text>
                  <Text size="xs" c="dimmed">
                    since {fmtTime(device.createdAt)}
                  </Text>
                </Group>
              </Stack>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
