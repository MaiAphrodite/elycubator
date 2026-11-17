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
} from "@mantine/core";
import {
  AlertRegular,
  CheckCircleRegular,
  DeviceRegular,
  InformationRegular,
  Refresh2Regular,
} from "@mingcute/react/core-regular";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/dashboard/SectionHeader";
import { useAuth } from "../contexts/AuthContext";
import type { Device, PendingDevice } from "../types/device";
import { parseServerTimestamp } from "../lib/time";

const REFRESH_MS = 10000;

function fmtTime(value: string): string {
  return parseServerTimestamp(value).toLocaleString();
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
    <Stack gap="lg" p={{ base: "xs", sm: "md" }}>
      <PageHeader
        title="Perangkat"
        subtitle={`${devices.length} claimed, ${pending.length} waiting`}
        actions={
          <Button
            variant="default"
            size="compact-sm"
            leftSection={<Refresh2Regular size={16} />}
            onClick={() => load()}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert icon={<AlertRegular size={19} />} title="Kesalahan" color="red">
          {error}
        </Alert>
      )}
      {note && (
        <Alert icon={<CheckCircleRegular size={19} />} title="Selesai" color="sage">
          {note}
        </Alert>
      )}

      <Card>
        <SectionHeader icon={<DeviceRegular size={18} />} title="Tambah perangkat" />
        <Text size="xs" c="dimmed" mb="md">
          Power the incubator and wait for it to connect. The PIN on its screen proves
          you have physical access.
        </Text>
        <form onSubmit={claim}>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" mb="md">
            <TextInput
              label="PIN pasangan"
              placeholder="205026"
              value={pin}
              onChange={(event) => setPin(event.currentTarget.value)}
              maxLength={8}
              inputMode="numeric"
              required
              styles={{ input: { fontFamily: "var(--font-mono)" } }}
            />
            <TextInput
              label="Nama panggilan"
              placeholder="Inkubator 1"
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
            leftSection={<CheckCircleRegular size={19} />}
          >
            Claim device
          </Button>
        </form>
      </Card>

      <Card>
        <SectionHeader
          icon={<InformationRegular size={18} />}
          title="Menunggu diklaim"
          trailing={
            pending.length > 0 ? (
              <Badge color="amber" variant="light" size="sm" tt="none">
                {pending.length} waiting
              </Badge>
            ) : undefined
          }
        />
        <Divider mb="sm" />
        {pending.length === 0 ? (
          <Text size="xs" c="dimmed">
            Nothing waiting. Devices appear here after they register with the server.
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
                  size="sm"
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

      <Card>
        <SectionHeader icon={<CheckCircleRegular size={18} />} title="Perangkat saya" />
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
                  <Badge color="sage" variant="light" size="sm">
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
