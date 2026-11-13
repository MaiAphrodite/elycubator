import { createTheme } from "@mantine/core";

const FONT_BODY = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

export const BRAND = "#3E5222";
export const CREAM = "#FBF8F0";

export const theme = createTheme({
  primaryColor: "olive",
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
    olive: [
      "#F7F8EF",
      "#EDEFD9",
      "#DCE1C0",
      "#C6CE9E",
      "#AEB97B",
      "#8B9957",
      "#5F7038",
      "#3E5222",
      "#34461D",
      "#2A3A18",
    ],
    cream: [
      "#FFFDF8",
      "#FBF8F0",
      "#F6F1E4",
      "#EFE8D7",
      "#E5DCC6",
      "#D9CDB1",
      "#C7B795",
      "#B3A078",
      "#97845E",
      "#7A6948",
    ],
    dark: [
      "#E4E7DB",
      "#CBD1BF",
      "#9AA389",
      "#7B846C",
      "#535B45",
      "#454D39",
      "#353C2B",
      "#2B321F",
      "#232919",
      "#1A1F12",
    ],
  },
  other: {
    brand: BRAND,
    cream: CREAM,
    surface: "#FFFDF8",
  },
});
