import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface PageHeaderProps {
  readonly title: string;
  /** Second line under the title, usually a timestamp or a count. */
  readonly subtitle?: ReactNode;
  /** Right-hand controls. Keep it to one or two items. */
  readonly actions?: ReactNode;
}

/**
 * One page header for every route: same type ramp, same control placement.
 * Before this each page rolled its own `Group` plus `Title` at a different size.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
        <Title order={2} fw={800} lh={1.15} fz={{ base: "1.6rem", sm: "2.1rem" }}>
          {title}
        </Title>
        {actions ? (
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            {actions}
          </Group>
        ) : null}
      </Group>
      {subtitle ? <Text size="xs" c="dimmed" ff="monospace" truncate>{subtitle}</Text> : null}
    </Stack>
  );
}
