import {
  createTheme,
  defaultVariantColorsResolver,
  type VariantColorsResolver,
} from "@mantine/core";

const FONT_BODY = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

/**
 * Filled controls take their background from a CSS variable that follows the
 * colour scheme, but Mantine's default resolver picks the text colour from the
 * light-mode primary shade in both schemes (its `parseThemeColor` call defaults
 * to `colorScheme: "light"`). With `primaryShade` flipped per scheme that makes
 * the dark-mode cream button render white-on-cream. Defer the text colour to a
 * variable that flips with the scheme instead.
 */
const schemeAwareContrast: VariantColorsResolver = (input) => {
  const resolved = defaultVariantColorsResolver(input);
  const isFilled = !input.variant || input.variant === "filled";
  const explicitShade = input.color?.includes(".");
  const autoContrast = input.autoContrast ?? input.theme.autoContrast;

  if (!isFilled || explicitShade || !autoContrast) return resolved;

  return { ...resolved, color: "var(--brand-filled-contrast)" };
};

/* -------------------------------------------------------------------------- */
/*  Brand palette                                                             */
/* -------------------------------------------------------------------------- */
/*
 * The brand ink is sampled straight out of the delivered PinkEggs logo
 * (apps/web/public/brand), which is one flat cream on transparency. Change
 * BRAND_BASE and the whole 10-shade ramp, every `color="brand"` component and
 * the neutral ramps below stay in tune because they are mixed from it.
 */
export const BRAND_BASE = "#FDE4BA";

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

const toHex = ({ r, g, b }: Rgb) =>
  "#" +
  [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

/** Mix `amount` (0-1) of `target` into `color`. */
function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Mantine needs 10 shades, lightest (0) to darkest (9).
 * Index 5 holds the untouched base colour; 0-4 are tints toward white and
 * 6-9 are shades toward black.
 *
 * `toBlack` runs deep on purpose: filled controls use shade 9 in light mode,
 * so the last step has to land on the logo's espresso tile tone rather than a
 * merely darker cream.
 */
function rampFromBase(base: Rgb): string[] {
  const toWhite = [0.92, 0.76, 0.58, 0.38, 0.18];
  const toBlack = [0.18, 0.36, 0.56, 0.78];
  return [
    ...toWhite.map((amount) => toHex(mix(base, WHITE, amount))),
    toHex(base),
    ...toBlack.map((amount) => toHex(mix(base, BLACK, amount))),
  ];
}

export const BRAND_RGB = hexToRgb(BRAND_BASE);
export const BRAND = toHex(BRAND_RGB);
export const BRAND_RAMP = rampFromBase(BRAND_RGB);

/** The warm black the logo sits on, used for filled controls and dark surfaces. */
export const INK = "#383229";

/** Eggshell paper tone for page and card surfaces. */
export const CREAM = "#FDF9EF";

/* Paper tones are hand-stepped between the ink and the brand cream rather than
   mixed from the brand base: a straight mix turns every surface into a yellow
   wash, while a page needs to sit just off white with the warmth kept low. */
const CREAM_RAMP = [
  "#FFFDF8",
  CREAM,
  "#F8F1E1",
  "#EFE6D1",
  "#E5D8BE",
  "#D5C4A4",
  "#BEAA85",
  "#A08A64",
  "#806C4B",
  "#5F5037",
] as const;

export const theme = createTheme({
  primaryColor: "brand",
  // Light mode uses a dark shade so filled controls keep readable text;
  // dark mode can use a lighter tint of the same hue.
  primaryShade: { light: 9, dark: 3 },
  autoContrast: true,
  variantColorResolver: schemeAwareContrast,

  /* Bigger type across the whole app - the previous sizes read as too small.
     Values already include the extra step, so `scale` stays at 1 for text. */
  scale: 1.1,
  fontSizes: {
    xs: "0.875rem",   // 14px - labels, captions
    sm: "1rem",       // 16px - secondary text
    md: "1.125rem",   // 18px - body / default
    lg: "1.25rem",    // 20px
    xl: "1.6rem",     // 25.6px
  },
  fontFamily: FONT_BODY,
  fontFamilyMonospace: FONT_MONO,
  headings: {
    fontFamily: FONT_BODY,
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "2.6rem", lineHeight: "1.15" },
      h2: { fontSize: "2.1rem", lineHeight: "1.2" },
      h3: { fontSize: "1.75rem", lineHeight: "1.25" },
      h4: { fontSize: "1.45rem", lineHeight: "1.3" },
      h5: { fontSize: "1.25rem", lineHeight: "1.35" },
      h6: { fontSize: "1.1rem", lineHeight: "1.4" },
    },
  },
  radius: {
    xs: "0.5rem",
    sm: "0.625rem",
    md: "0.875rem",
    lg: "1.125rem",
    xl: "1.5rem",
  },
  defaultRadius: "lg",
  spacing: {
    xs: "0.625rem",
    sm: "0.875rem",
    md: "1.125rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  colors: {
    brand: BRAND_RAMP as unknown as [string, string, string, string, string, string, string, string, string, string],
    // Paper tones for page, card and border surfaces.
    cream: CREAM_RAMP as unknown as [string, string, string, string, string, string, string, string, string, string],
    // Semantic hues stay distinct on purpose: amber is heat, sage is moisture.
    sage: [
      "#F4F7EF",
      "#E7EEDD",
      "#D2DEC3",
      "#B9CBA4",
      "#9FB787",
      "#859E6C",
      "#6C8455",
      "#566B42",
      "#415232",
      "#2D3A22",
    ],
    amber: [
      "#FEF6E9",
      "#FDECD0",
      "#FAD9A8",
      "#F6C27C",
      "#F0A852",
      "#E28D31",
      "#C1731F",
      "#9C5B17",
      "#784512",
      "#56300C",
    ],
    dark: [
      "#F5EFE4",
      "#E3DACA",
      "#C3BAAA",
      "#9B9182",
      "#726A5C",
      "#565044",
      "#433D33",
      "#332E26",
      "#26211A",
      "#1A1611",
    ],
  },
  other: {
    brand: BRAND,
    cream: CREAM,
    surface: CREAM_RAMP[0],
  },
  components: {
    Text: { defaultProps: { size: "md" } },
    Title: { defaultProps: { fw: 700 } },
    Card: { defaultProps: { padding: "md", radius: "lg" } },
    Paper: { defaultProps: { p: "md", radius: "lg" } },
    Button: { defaultProps: { size: "md", radius: "lg" } },
    ActionIcon: { defaultProps: { size: "lg", radius: "lg" } },
    Badge: { defaultProps: { size: "md", radius: "sm" } },
    Switch: { defaultProps: { size: "lg" } },
    Progress: { defaultProps: { size: "md", radius: "xl" } },
    ThemeIcon: { defaultProps: { size: "lg", radius: "lg" } },
    Alert: { defaultProps: { radius: "lg", p: "md" } },
    TextInput: { defaultProps: { size: "md", radius: "lg" } },
    PasswordInput: { defaultProps: { size: "md", radius: "lg" } },
    NumberInput: { defaultProps: { size: "md", radius: "lg" } },
    Select: { defaultProps: { size: "md", radius: "lg" } },
    Tabs: { defaultProps: { radius: "lg" } },
  },
});
