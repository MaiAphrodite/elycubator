import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { MotionConfig } from "framer-motion";
import "@mantine/core/styles.css";
import "./index.css";
import { theme } from "./theme";
import App from "./App";
import { registerServiceWorker } from "./lib/pwa";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {/* A CSS prefers-reduced-motion block cannot stop JS-driven animation, so
          the OS preference is honoured here for every framer-motion transition. */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </MantineProvider>
  </StrictMode>
);
