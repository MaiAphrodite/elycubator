import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { AlertRegular, SendPlaneRegular } from "@mingcute/react/core-regular";
import { useAuth } from "../contexts/AuthContext";
import type { Device } from "../types/device";
import { SectionHeader } from "./dashboard/SectionHeader";

interface AssistantReply {
  answer: string;
  source: "model" | "facts";
}

const PRESETS = [
  "How was last night?",
  "Is the batch at risk?",
  "How is humidity?",
] as const;

/**
 * Questions answered from the device's own telemetry. The server reduces the
 * readings to facts first, so an answer can be checked against the data it
 * claims to describe, and the card shows where the wording came from.
 */
export function AssistantPanel({ deviceId }: { readonly deviceId: string | null }) {
  const { apiFetch } = useAuth();
  // The live socket only knows the device while it is streaming, but the
  // answers come from stored telemetry, so fall back to the owned device list
  // and let the panel work with the incubator switched off.
  const [ownedDeviceId, setOwnedDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (deviceId) return;
    let cancelled = false;
    apiFetch("/api/devices")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || !body?.success) return;
        const first = (body.data as Device[] | undefined)?.[0];
        if (first) setOwnedDeviceId(first.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiFetch, deviceId]);

  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeDeviceId = deviceId ?? ownedDeviceId;

  const ask = async (text: string) => {
    if (!activeDeviceId || text.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/device/${activeDeviceId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text.trim() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || "Could not answer that.");
      setReply({ answer: body.data.answer, source: body.data.source });
    } catch (err) {
      setError((err as Error).message);
      setReply(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<AlertRegular size={18} />}
        title="Ask about this incubator"
        trailing={
          reply ? (
            <Text size="xs" c="dimmed">
              {reply.source === "model" ? "written from recorded facts" : "straight from the readings"}
            </Text>
          ) : undefined
        }
      />

      <Group gap={6} wrap="wrap" mb="sm">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            size="compact-sm"
            variant="light"
            color="brand"
            onClick={() => {
              setQuestion(preset);
              void ask(preset);
            }}
            disabled={busy || !activeDeviceId}
          >
            {preset}
          </Button>
        ))}
      </Group>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <Group gap="xs" wrap="nowrap">
          <TextInput
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            placeholder="Or ask something else, e.g. how long was the lamp at full duty?"
            style={{ flex: 1 }}
            maxLength={300}
          />
          <ActionIcon
            type="submit"
            variant="default"
            size="lg"
            aria-label="Ask"
            loading={busy}
            disabled={!activeDeviceId || question.trim().length === 0}
          >
            <SendPlaneRegular size={20} />
          </ActionIcon>
        </Group>
      </form>

      {busy && (
        <Group gap={8} mt="sm">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Reading the last 24 hours of telemetry
          </Text>
        </Group>
      )}

      {!activeDeviceId && (
        <Text size="xs" c="dimmed" mt="sm">
          No device on this account yet. Claim one on the Devices page first.
        </Text>
      )}

      {error && (
        <Text size="sm" c="red" mt="sm">
          {error}
        </Text>
      )}

      {reply && !busy && (
        <Stack gap={4} mt="sm">
          <Text size="sm">{reply.answer}</Text>
          <Text size="xs" c="dimmed">
            Figures come from the recorded readings, not from guesswork.
          </Text>
        </Stack>
      )}
    </Card>
  );
}
