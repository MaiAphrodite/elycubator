import { Group, Text, useComputedColorScheme } from "@mantine/core";

/* The delivered logo is one flat cream ink, so it ships as two recolours and
   the scheme picks which one sits on the surface underneath. */
const MARK_SRC = {
  light: "/brand/mark-ink.png",
  dark: "/brand/mark-cream.png",
} as const;

const LOCKUP_SRC = {
  light: "/brand/lockup-ink.png",
  dark: "/brand/lockup-cream.png",
} as const;

interface BrandMarkProps {
  /** Height of the cube mark in pixels. */
  readonly size?: number;
  /** Wordmark next to the mark. Off when the mark stands alone. */
  readonly withWordmark?: boolean;
}

export function BrandMark({ size = 34, withWordmark = true }: BrandMarkProps) {
  const scheme = useComputedColorScheme("light");

  return (
    <Group gap={size * 0.3} wrap="nowrap">
      <img
        src={MARK_SRC[scheme]}
        alt={withWordmark ? "" : "PinkEggs"}
        style={{ height: size, width: "auto", display: "block" }}
      />
      {withWordmark && (
        <Text
          fw={800}
          lh={1}
          style={{ fontSize: size * 0.6, letterSpacing: "-0.02em" }}
        >
          PinkEggs
        </Text>
      )}
    </Group>
  );
}

/** Stacked mark plus wordmark, for the sign-in screen. */
export function BrandLockup({ height = 132 }: { readonly height?: number }) {
  const scheme = useComputedColorScheme("light");

  return (
    <img
      src={LOCKUP_SRC[scheme]}
      alt="PinkEggs"
      style={{ height, width: "auto", display: "block", margin: "0 auto" }}
    />
  );
}
