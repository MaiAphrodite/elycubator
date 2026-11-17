import { useEffect, useState, useSyncExternalStore } from "react";
import { ActionIcon, Affix, Button, Card, Group, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { CloseRegular, DownloadRegular } from "@mingcute/react/core-regular";
import {
  hasDeferredPrompt,
  installHint,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from "../lib/install";

const DISMISS_KEY = "install-dismissed-at";
const DISMISS_DAYS = 7;
const DELAY_MS = 2500;

function dismissedRecently(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
}

/**
 * The install prompt Chrome used to show on its own. Chrome dropped that
 * banner, so sites raise the dialog themselves: the button below calls the
 * stored `beforeinstallprompt`, which opens Chrome's real install sheet. When
 * no prompt was offered (desktop, or a browser without it) the card explains
 * the manual step instead of doing nothing.
 */
export function InstallBanner() {
  const isPhone = useMediaQuery("(max-width: 48em)");
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(() => dismissedRecently());
  const [expanded, setExpanded] = useState(false);
  const standalone = useSyncExternalStore(
    subscribeInstall,
    isStandalone,
    () => false,
  );
  useSyncExternalStore(subscribeInstall, hasDeferredPrompt, () => false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (standalone || hidden || !ready) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  };

  return (
    <Affix
      position={{ bottom: isPhone ? 104 : 20, left: isPhone ? 12 : undefined, right: 12 }}
      style={{ zIndex: 150 }}
    >
      <Card
        p="sm"
        radius="lg"
        shadow="md"
        style={{ maxWidth: 420, backgroundColor: "var(--surface-raised)" }}
      >
        <Group gap="sm" wrap="nowrap" align="center">
          <img
            src="/brand/icon-192.png"
            alt=""
            width={38}
            height={38}
            style={{ borderRadius: 10, flexShrink: 0 }}
          />
          <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" fw={700} lh={1.2}>
              Add PinkEggs to your home screen
            </Text>
            <Text size="xs" c="dimmed" lh={1.2} lineClamp={expanded ? undefined : 1}>
              {installHint()}
            </Text>
          </Stack>
          <Button
            size="compact-sm"
            leftSection={<DownloadRegular size={16} />}
            onClick={() => {
              if (promptInstall()) {
                dismiss();
                return;
              }
              // No native prompt to replay, so spell out the manual step.
              setExpanded(true);
            }}
          >
            {expanded ? "Got it" : "Install"}
          </Button>
          <ActionIcon variant="subtle" color="gray" onClick={dismiss} aria-label="Dismiss install prompt">
            <CloseRegular size={18} />
          </ActionIcon>
        </Group>
      </Card>
    </Affix>
  );
}
