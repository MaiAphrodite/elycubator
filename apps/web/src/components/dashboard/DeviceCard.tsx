import { useEffect, useState } from "react";
import { Card, Divider, Group, Skeleton, Stack, Text } from "@mantine/core";
import { ChipRegular } from "@mingcute/react/core-regular";
import { useAuth } from "../../contexts/AuthContext";
import type { Device } from "../../types/device";
import { formatElapsed } from "../../lib/time";
import { SectionHeader } from "./SectionHeader";

interface DeviceCardProps {
  readonly deviceId: string | null;
  readonly bufferedReadings: number;
  /** Age of the last reading in ms, null before the first one arrives. */
  readonly frameAge: number | null;
}

const LIVE_WINDOW_MS = 8000;

/** Which physical box is feeding this dashboard, and whether it is still talking. */
export function DeviceCard({ deviceId, bufferedReadings, frameAge }: DeviceCardProps) {
  const { apiFetch } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    apiFetch("/api/devices")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || !body?.success) return;
        const match = (body.data as Device[] | undefined)?.find((item) => item.id === deviceId);
        if (match) setDevice(match);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, apiFetch]);

  const live = frameAge !== null && frameAge < LIVE_WINDOW_MS;
  const linkLabel =
    frameAge === null ? "waiting for the first frame" : `${formatElapsed(frameAge)} ago`;

  return (
    <Card h="100%">
      <SectionHeader
        icon={<ChipRegular size={18} />}
        title="Device"
        trailing={
          <Text size="xs" fw={600} c={live ? "sage.7" : "amber.7"} tt="none">
            {live ? "Live" : "Stale"}
          </Text>
        }
      />

      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="xs" c="dimmed">
            Name
          </Text>
          {loading ? (
            <Skeleton height={14} width={110} radius="sm" />
          ) : (
            <Text size="xs" fw={600} truncate>
              {device?.nickname ?? "Unnamed device"}
            </Text>
          )}
        </Group>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="xs" c="dimmed">
            MAC
          </Text>
          {loading ? (
            <Skeleton height={14} width={140} radius="sm" />
          ) : (
            <Text size="xs" ff="monospace" truncate>
              {device?.macAddress ?? deviceId?.slice(0, 12) ?? "—"}
            </Text>
          )}
        </Group>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="xs" c="dimmed">
            Last reading
          </Text>
          <Text size="xs" ff="monospace" truncate>
            {linkLabel}
          </Text>
        </Group>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="xs" c="dimmed">
            Readings
          </Text>
          <Text size="xs" ff="monospace">
            {bufferedReadings} readings
          </Text>
        </Group>
      </Stack>

      <Divider my="sm" />
      <Text size="xs" c="dimmed">
        {live
          ? "Receiving data."
          : "No data arriving. Values may be out of date."}
      </Text>
    </Card>
  );
}
