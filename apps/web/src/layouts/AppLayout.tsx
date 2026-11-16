import { type ReactNode } from "react";
import {
  AppShell,
  Group,
  Stack,
  Text,
  UnstyledButton,
  Box,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { motion } from "framer-motion";
import { pageEnter } from "../lib/motion";
import { DashboardRegular, DeviceRegular, ExitRegular, HistoryRegular, Settings1Regular } from "@mingcute/react/core-regular";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTelemetryStream } from "../hooks/useTelemetryStream";
import { LinkTrace } from "../components/LinkTrace";
import { BrandMark } from "../components/BrandMark";

interface AppLayoutProps {
  readonly children: ReactNode;
}

const NAV_ITEMS = [
  { label: "Dashboard", icon: DashboardRegular, path: "/" },
  { label: "History", icon: HistoryRegular, path: "/history" },
  { label: "Devices", icon: DeviceRegular, path: "/devices" },
  { label: "Settings", icon: Settings1Regular, path: "/settings" },
] as const;

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { lastReceivedAt } = useTelemetryStream();
  const showWordmark = useMediaQuery("(min-width: 36em)");

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppShell
      header={{ height: 68 }}
      navbar={
        isMobile ? undefined : { width: 268, breakpoint: "sm" }
      }
      padding="lg"
    >
      <AppShell.Header
        style={{
          backdropFilter: "blur(12px)",
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <BrandMark size={34} withWordmark={showWordmark} />
          </Group>

          <Group gap="sm">
            {user && (
              <Text size="sm" fw={500} visibleFrom="sm">
                Hi, {user.name}
              </Text>
            )}
            <LinkTrace lastReceivedAt={lastReceivedAt} />
            <UnstyledButton onClick={logout} style={{ display: 'flex', alignItems: 'center' }}>
              <ExitRegular size={20} color="var(--mantine-color-red-6)" />
            </UnstyledButton>
          </Group>
        </Group>
      </AppShell.Header>

      {!isMobile && (
        <AppShell.Navbar p="sm">
          <Stack gap={4}>
            <Text
              size="xs"
              fw={700}
              c="dimmed"
              tt="uppercase"
              lts="0.08em"
              mb="xs"
              px="sm"
            >
              Menu
            </Text>
            {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
              const isActive = location.pathname === path;
              return (
                <UnstyledButton
                  key={path}
                  onClick={() => navigate(path)}
                  px="md"
                  py={10}
                  style={(theme) => ({
                    borderRadius: theme.radius.lg,
                    backgroundColor: isActive
                      ? "var(--mantine-color-brand-light)"
                      : "transparent",
                    color: isActive
                      ? "var(--mantine-color-brand-filled)"
                      : "var(--mantine-color-text)",
                    fontWeight: isActive ? 600 : 400,
                    fontSize: "1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    transition: "background-color 150ms ease",
                  })}
                >
                  <Icon size={22} />
                  {label}
                </UnstyledButton>
              );
            })}
          </Stack>
        </AppShell.Navbar>
      )}

      <AppShell.Main id="main-content" tabIndex={-1} style={{ minHeight: "100dvh" }}>
        {/* Keep content readable on wide screens instead of stretching edge to edge */}
        <motion.div
          key={location.pathname}
          variants={pageEnter}
          initial="hidden"
          animate="show"
          style={{ width: "100%", maxWidth: 1220, marginInline: "auto" }}
        >
          {children}
        </motion.div>
      </AppShell.Main>

      {isMobile && (
        <Box
          component="nav"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            height: "var(--bottom-nav-height)",
            paddingBottom: "var(--safe-area-bottom)",
            backgroundColor: "color-mix(in srgb, var(--mantine-color-body) 90%, transparent)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderTop: "1px solid var(--mantine-color-default-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            paddingLeft: "var(--safe-area-left)",
            paddingRight: "var(--safe-area-right)",
          }}
        >
          {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
            const isActive = location.pathname === path;
            return (
              <UnstyledButton
                key={path}
                className="bottom-nav-item"
                onClick={() => navigate(path)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 22px",
                  borderRadius: "1rem",
                  color: isActive
                    ? "var(--mantine-color-brand-filled)"
                    : "var(--mantine-color-dimmed)",
                  backgroundColor: isActive
                    ? "var(--mantine-color-brand-light)"
                    : "transparent",
                  transition: "background-color 200ms ease, color 200ms ease",
                  minWidth: 74,
                }}
              >
                <Icon size={26} />
                <Text
                  size="xs"
                  fw={isActive ? 700 : 500}
                  lh={1}
                  style={{ fontSize: "0.72rem", letterSpacing: "0.02em" }}
                >
                  {label}
                </Text>
              </UnstyledButton>
            );
          })}
        </Box>
      )}
      </AppShell>
    </>
  );
}
