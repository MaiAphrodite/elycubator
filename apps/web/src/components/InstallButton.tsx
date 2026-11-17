import { useSyncExternalStore, useState } from "react";
import { ActionIcon, Popover, Stack, Text, Tooltip } from "@mantine/core";
import { DownloadRegular } from "@mingcute/react/core-regular";
import {
  hasDeferredPrompt,
  installHint,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from "../lib/install";

/** Subscribe to the deferred-install state so the button re-renders. */
function useInstallState(): { available: boolean; standalone: boolean } {
  const version = useSyncExternalStore(
    subscribeInstall,
    () => String(hasDeferredPrompt()) + String(isStandalone()),
    () => "falsefalse",
  );
  return { available: version.startsWith("true"), standalone: version.endsWith("true") };
}

/**
 * Always offers a way to install. Chrome on Android stopped showing its own
 * banner, and the native prompt is only replayable once, so when there is no
 * stored prompt this falls back to instructions instead of silence.
 */
export function InstallButton() {
  const { available, standalone } = useInstallState();
  const [opened, setOpened] = useState(false);

  if (standalone) return null;

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={280} radius="lg">
      <Popover.Target>
        <Tooltip label="Pasang sebagai aplikasi" disabled={opened}>
          <ActionIcon
            variant="default"
            aria-label="Pasang PinkEggs sebagai aplikasi"
            onClick={() => {
              if (!promptInstall()) setOpened(true);
            }}
          >
            <DownloadRegular size={20} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown p="sm">
        <Stack gap={6}>
          <Text size="sm" fw={700}>
            Install PinkEggs
          </Text>
          <Text size="xs" c="dimmed">
            {available
              ? "Tap Install to add it to your home screen."
              : installHint()}
          </Text>
          <Text size="xs" c="dimmed">
            It opens full screen with its own icon, like a normal app.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
