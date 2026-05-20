import { createTheme } from "@mantine/core";

const FONT_BODY = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

export const theme = createTheme({
  primaryColor: "indigo",
  fontFamily: FONT_BODY,
  fontFamilyMonospace: FONT_MONO,
  headings: {
    fontFamily: FONT_BODY,
    fontWeight: "700",
  },
  radius: {
    xs: "0.375rem",
    sm: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.5rem",
  },
  defaultRadius: "lg",
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.25rem",
    xl: "1.5rem",
  },
  colors: {
    dark: [
      "#C9C9C9",
      "#b8b8b8",
      "#828282",
      "#696969",
      "#424242",
      "#3b3b3b",
      "#2e2e2e",
      "#242424",
      "#1f1f1f",
      "#141414",
    ],
  },
});
