import { AppShell, Badge, Burger, Center, Group, Loader, NavLink, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconConfetti,
  IconLayoutDashboard,
  IconLogout,
  IconRobot,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, setUnauthorizedHandler, type Meta } from "./api";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";
import { NewPartyPage } from "./pages/NewPartyPage";
import { PartiesPage } from "./pages/PartiesPage";
import { PartyPage } from "./pages/PartyPage";
import { SettingsPage } from "./pages/SettingsPage";

interface MetaContextValue {
  meta: Meta;
  refreshMeta: () => Promise<void>;
}
const MetaContext = createContext<MetaContextValue | null>(null);
export function useMeta() {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error("useMeta outside provider");
  return ctx;
}

const NAV = [
  { to: "/", label: "דשבורד", icon: IconLayoutDashboard },
  { to: "/parties", label: "מסיבות", icon: IconConfetti },
  { to: "/calendar", label: "לוח פרסומים", icon: IconCalendarEvent },
  { to: "/leads", label: "לידים ושיחות", icon: IconUsers },
  { to: "/settings", label: "הגדרות", icon: IconSettings },
];

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const refreshMeta = useCallback(async () => {
    setMeta(await api.get<Meta>("/api/meta"));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
    api
      .get<{ authed: boolean }>("/api/auth/me")
      .then((r) => setAuthed(r.authed))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) void refreshMeta();
  }, [authed, refreshMeta]);

  if (authed === null || (authed && !meta)) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  return (
    <MetaContext.Provider value={{ meta: meta!, refreshMeta }}>
      <Shell onLogout={() => setAuthed(false)} />
    </MetaContext.Provider>
  );
}

function StatusDot({ ok, label, icon: Icon }: { ok: boolean; label: string; icon: typeof IconRobot }) {
  return (
    <Tooltip label={label}>
      <Badge
        variant="light"
        color={ok ? "teal" : "gray"}
        leftSection={<Icon size={14} />}
        styles={{ label: { overflow: "visible" } }}
      >
        {ok ? "מחובר" : "דמו"}
      </Badge>
    </Tooltip>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const { meta } = useMeta();

  const logout = async () => {
    await api.post("/api/auth/logout");
    onLogout();
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <UnstyledButton onClick={() => navigate("/")}>
              <Group gap={8}>
                <Text fz={26}>🎉</Text>
                <div>
                  <Text fw={800} fz="lg" lh={1}>
                    {meta.companyName}
                  </Text>
                  <Text fz="xs" c="dimmed" lh={1.2}>
                    מערכת ניהול מסיבות
                  </Text>
                </div>
              </Group>
            </UnstyledButton>
          </Group>
          <Group gap={6} visibleFrom="sm">
            <StatusDot
              ok={meta.instagramLive}
              icon={IconBrandInstagram}
              label={meta.instagramLive ? "אינסטגרם מחובר: פוסטים יעלו באמת" : "אינסטגרם במצב דמו: פרסום מדומה"}
            />
            <StatusDot
              ok={meta.greenApiConfigured}
              icon={IconBrandWhatsapp}
              label={meta.greenApiConfigured ? "וואטסאפ (GREEN-API) מחובר" : "וואטסאפ לא מחובר עדיין"}
            />
            <StatusDot
              ok={meta.agentConfigured}
              icon={IconRobot}
              label={meta.agentConfigured ? `סוכן AI פעיל (${meta.agentModel})` : "חסר מפתח API לסוכן"}
            />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Stack justify="space-between" h="100%">
          <Stack gap={4}>
            {NAV.map((item) => {
              const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  label={item.label}
                  leftSection={<item.icon size={20} stroke={1.6} />}
                  active={active}
                  variant="light"
                  style={{ borderRadius: 8 }}
                  onClick={() => {
                    navigate(item.to);
                    close();
                  }}
                />
              );
            })}
          </Stack>
          <NavLink
            label="התנתקות"
            leftSection={<IconLogout size={20} stroke={1.6} />}
            onClick={logout}
            style={{ borderRadius: 8 }}
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/parties" element={<PartiesPage />} />
          <Route path="/parties/new" element={<NewPartyPage />} />
          <Route path="/parties/:id" element={<PartyPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
