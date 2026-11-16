import { Box, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";

interface SectionHeaderProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly trailing?: ReactNode;
}

/** Icon, title and optional badge row shared by the dashboard info cards. */
export function SectionHeader({ icon, title, trailing }: SectionHeaderProps) {
  return (
    <Group justify="space-between" wrap="nowrap" mb="sm">
      <Group gap={8} wrap="nowrap">
        <Box
          style={{ display: "flex", color: "var(--mantine-color-dimmed)" }}
          aria-hidden
        >
          {icon}
        </Box>
        <Text size="sm" fw={700}>
          {title}
        </Text>
      </Group>
      {trailing}
    </Group>
  );
}
