import { useState, useSyncExternalStore } from "react";
import { ActionIcon, Badge, Box, Button, Indicator, Popover, ScrollArea, Stack, Text } from "@mantine/core";
import { AlertRegular, CheckCircleRegular, CloseCircleRegular, NotificationRegular } from "@mingcute/react/core-regular";
import {
  clearAlerts,
  getAlertSnapshot,
  markAlertsRead,
  requestNotificationPermission,
  subscribeAlerts,
  type AlertSeverity,
} from "../lib/alerts";
import { formatElapsed } from "../lib/time";
import { useNow } from "../hooks/useNow";

const SEVERITY_COLOUR: Record<AlertSeverity, string> = {
  critical: "red",
  warning: "amber",
  info: "sage",
};

/**
 * Alert inbox in the shell. The engine does the deciding; this only lists what
 * it produced and offers the browser permission prompt.
 */
export function AlertBell() {
  const [opened, setOpened] = useState(false);
  const snapshot = useSyncExternalStore(subscribeAlerts, getAlertSnapshot, getAlertSnapshot);
  const now = useNow(20_000);

  const open = () => {
    setOpened((value) => !value);
    if (!opened) markAlertsRead();
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={330} shadow="md" radius="lg">
      <Popover.Target>
        <Indicator
          inline
          size={16}
          label={snapshot.unread > 9 ? "9+" : snapshot.unread}
          disabled={snapshot.unread === 0}
          color="red"
          offset={6}
        >
          <ActionIcon
            variant="default"
            onClick={open}
            aria-label={
              snapshot.unread > 0 ? `Alerts, ${snapshot.unread} unread` : "Alerts, nothing unread"
            }
          >
            <NotificationRegular size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p="sm">
        <Stack gap="xs">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" lts="0.04em">
            Alerts
          </Text>

          {snapshot.alerts.length === 0 ? (
            <Text size="sm" c="dimmed" py="sm">
              Nothing has happened yet.
            </Text>
          ) : (
            <ScrollArea.Autosize mah={280}>
              <Stack gap={6}>
                {snapshot.alerts.map((alert) => (
                  <Box
                    key={alert.id}
                    p={8}
                    style={{
                      borderRadius: "var(--mantine-radius-md)",
                      backgroundColor: "var(--surface-raised)",
                    }}
                  >
                    <Stack gap={2}>
                      <Box
                        component="span"
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                      >
                        {alert.severity === "critical" ? (
                          <CloseCircleRegular size={16} color={`var(--mantine-color-${SEVERITY_COLOUR[alert.severity]}-6)`} />
                        ) : alert.severity === "warning" ? (
                          <AlertRegular size={16} color={`var(--mantine-color-${SEVERITY_COLOUR[alert.severity]}-6)`} />
                        ) : (
                          <CheckCircleRegular size={16} color={`var(--mantine-color-${SEVERITY_COLOUR[alert.severity]}-6)`} />
                        )}
                        <Text size="sm" fw={600}>
                          {alert.title}
                        </Text>
                        <Badge size="xs" variant="transparent" c="dimmed" ml="auto" tt="none">
                          {formatElapsed(now - alert.at)} ago
                        </Badge>
                      </Box>
                      <Text size="xs" c="dimmed">
                        {alert.detail}
                      </Text>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}

          {snapshot.permission === "default" && (
            <Button size="compact-sm" variant="light" onClick={() => void requestNotificationPermission()}>
              Enable browser notifications
            </Button>
          )}
          {snapshot.permission === "denied" && (
            <Text size="xs" c="dimmed">
              Notifications are blocked for this site.
            </Text>
          )}

          {snapshot.alerts.length > 0 && (
            <Button size="compact-sm" variant="subtle" color="gray" onClick={clearAlerts}>
              Clear all
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
