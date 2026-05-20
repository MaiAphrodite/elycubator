import { type ReactNode } from "react";
import {
  AppShell,
  Group,
  Title,
  Stack,
  Badge,
  Text,
  UnstyledButton,
  Box,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconEgg,
  IconLayoutDashboard,
  IconHistory,
  IconSettings,
} from "@tabler/icons-react";
import { useLocation, useNavigate } from "react-router-dom";

interface AppLayoutProps {
  readonly children: ReactNode;
}

const NAV_ITEMS = [
  { label: "Dashboard", icon: IconLayoutDashboard, path: "/" },
  { label: "History", icon: IconHistory, path: "/history" },
  { label: "Settings", icon: IconSettings, path: "/settings" },
] as const;

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={
        isMobile ? undefined : { width: 220, breakpoint: "sm" }
      }
      padding="md"
    >
      <AppShell.Header
        style={{
          backdropFilter: "blur(12px)",
          backgroundColor: "color-mix(in srgb, var(--mantine-color-body) 85%, transparent)",
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconEgg
              size={24}
              stroke={1.5}
              style={{ color: "var(--mantine-color-indigo-6)" }}
            />
            <Title order={4} fw={800} visibleFrom="xs">
              Elycubator
            </Title>
          </Group>

          <Badge
            variant="dot"
            color="green"
            size="sm"
            radius="xl"
          >
            Online
          </Badge>
        </Group>
      </AppShell.Header>

      {!isMobile && (
        <AppShell.Navbar p="sm">
          <Stack gap={4}>
            <Text
              size="xs"
              fw={600}
              c="dimmed"
              tt="uppercase"
              lts="0.05em"
              mb={4}
              px="xs"
            >
              Menu
            </Text>
            {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
              const isActive = location.pathname === path;
              return (
                <UnstyledButton
                  key={path}
                  onClick={() => navigate(path)}
                  px="sm"
                  py="xs"
                  style={(theme) => ({
                    borderRadius: theme.radius.lg,
                    backgroundColor: isActive
                      ? "var(--mantine-color-indigo-light)"
                      : "transparent",
                    color: isActive
                      ? "var(--mantine-color-indigo-filled)"
                      : "var(--mantine-color-text)",
                    fontWeight: isActive ? 600 : 400,
                    fontSize: "0.875rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    transition: "background-color 150ms ease",
                  })}
                >
                  <Icon size={18} stroke={1.5} />
                  {label}
                </UnstyledButton>
              );
            })}
          </Stack>
        </AppShell.Navbar>
      )}

      <AppShell.Main
        style={{
          backgroundColor: "var(--mantine-color-body)",
          minHeight: "100dvh",
        }}
      >
        {children}
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
                  gap: 4,
                  padding: "8px 20px",
                  borderRadius: "1rem",
                  color: isActive
                    ? "var(--mantine-color-indigo-filled)"
                    : "var(--mantine-color-dimmed)",
                  backgroundColor: isActive
                    ? "var(--mantine-color-indigo-light)"
                    : "transparent",
                  transition: "all 200ms ease",
                  minWidth: 64,
                }}
              >
                <Icon size={22} stroke={isActive ? 2.2 : 1.5} />
                <Text
                  size="xs"
                  fw={isActive ? 700 : 500}
                  lh={1}
                  style={{ fontSize: "0.6rem", letterSpacing: "0.02em" }}
                >
                  {label}
                </Text>
              </UnstyledButton>
            );
          })}
        </Box>
      )}
    </AppShell>
  );
}
