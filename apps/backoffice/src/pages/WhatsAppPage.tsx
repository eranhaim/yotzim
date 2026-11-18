import {
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBrandWhatsapp,
  IconMessagePlus,
  IconPlus,
  IconSettings,
  IconSpeakerphone,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMeta } from "../App";
import { api, type GroupMessage, type Party, type SimContact, type WaChat, type WaGroup, type WaOverview } from "../api";
import { BroadcastModal } from "../components/wa/BroadcastModal";
import { ChatPane } from "../components/wa/ChatPane";
import { GroupFormModal } from "../components/wa/GroupFormModal";
import { GroupPane } from "../components/wa/GroupPane";
import { fmtNumber, fmtPhone, fmtRelative, leadStageLabel } from "../labels";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Box>
      <Text fz={22} fw={800} lh={1.1}>
        {value}
      </Text>
      <Text fz="xs" opacity={0.9}>
        {label}
      </Text>
      {hint && (
        <Text fz={11} opacity={0.7}>
          {hint}
        </Text>
      )}
    </Box>
  );
}

function DeviceCard({ overview, onToggleAgent }: { overview: WaOverview; onToggleAgent: (on: boolean) => void }) {
  const { meta } = useMeta();
  const navigate = useNavigate();
  const s = overview.stats;
  return (
    <Paper radius="lg" p="lg" c="white" style={{ background: "linear-gradient(120deg, #075e54, #128c7e 60%, #25d366)" }}>
      <Group justify="space-between" align="flex-start" mb="md">
        <Group gap="md">
          <Avatar size={56} radius="xl" color="white" variant="white">
            <Text fz={28}>🎉</Text>
          </Avatar>
          <div>
            <Group gap={8}>
              <Text fw={800} fz="xl">
                {meta.companyName}
              </Text>
              <Badge color={overview.live ? "lime" : "white"} variant={overview.live ? "filled" : "light"} c={overview.live ? undefined : "white"}>
                {overview.live ? "מחובר · GREEN-API" : "מספר בסימולציה"}
              </Badge>
            </Group>
            <Text fz="lg" fw={500} dir="ltr" ta="right">
              {fmtPhone(overview.number)}
            </Text>
            <Text fz="xs" opacity={0.8}>
              {overview.live
                ? "הודעות יוצאות ונכנסות דרך הטלפון של העסק"
                : overview.numberIsSet
                  ? "ההודעות נשמרות במערכת ולא יוצאות לוואטסאפ"
                  : "מספר לדוגמה · ההודעות נשמרות במערכת ולא יוצאות לוואטסאפ"}
            </Text>
          </div>
        </Group>
        <Stack gap={6} align="flex-end">
          <Switch
            color="lime"
            checked={overview.agentEnabled}
            onChange={(e) => onToggleAgent(e.currentTarget.checked)}
            label={<Text c="white" fz="sm">{overview.agentEnabled ? "סוכן AI עונה לפניות" : "סוכן AI כבוי"}</Text>}
          />
          <Button size="compact-sm" variant="white" color="dark" leftSection={<IconSettings size={14} />} onClick={() => navigate("/settings")}>
            הגדרות חיבור
          </Button>
        </Stack>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
        <Stat label="קבוצות מחוברות" value={s.groups} hint={s.communities ? `ו-${s.communities} קהילות` : undefined} />
        <Stat label="חברים בקבוצות" value={fmtNumber(s.members)} />
        <Stat label="פרסומים בקבוצות" value={s.announcementsSent} hint={s.announcementsScheduled ? `${s.announcementsScheduled} מתוזמנים` : undefined} />
        <Stat label="צ'אטים פרטיים" value={s.chats} hint={`${s.fromGroups} הגיעו מקבוצות`} />
        <Stat label="קישורי רכישה נשלחו" value={s.linksSent} />
      </SimpleGrid>
    </Paper>
  );
}

function ListItem({
  active,
  onClick,
  avatar,
  title,
  subtitle,
  side,
  indent,
}: {
  active: boolean;
  onClick: () => void;
  avatar: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  side?: ReactNode;
  indent?: boolean;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      px="sm"
      py={10}
      ps={indent ? 34 : "sm"}
      w="100%"
      bg={active ? "#f0f2f5" : undefined}
      style={{ borderBottom: "1px solid #f2f2f2" }}
    >
      <Group gap="sm" wrap="nowrap">
        {avatar}
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" gap={4} wrap="nowrap">
            <Text fz="sm" fw={600} truncate>
              {title}
            </Text>
            {side}
          </Group>
          <Text fz="xs" c="dimmed" truncate>
            {subtitle}
          </Text>
        </Box>
      </Group>
    </UnstyledButton>
  );
}

export function WhatsAppPage() {
  const { refreshMeta } = useMeta();
  const [search, setSearch] = useSearchParams();
  const [overview, setOverview] = useState<WaOverview | null>(null);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [contact, setContact] = useState<SimContact | null>(null);
  const [groupForm, setGroupForm] = useState<{ group: WaGroup | null } | null>(null);
  const [broadcast, setBroadcast] = useState<{ groupIds: number[]; partyId: number | null } | null>(null);
  const [groupVersion, setGroupVersion] = useState(0);
  /** Stays the same when a new simulated contact becomes a lead, so the chat pane is not rebuilt. */
  const [paneKey, setPaneKey] = useState("");

  const groupId = search.get("group") ? Number(search.get("group")) : null;
  const chatId = search.get("chat") ? Number(search.get("chat")) : null;
  const tab = search.get("tab") ?? (chatId || contact ? "chats" : "groups");

  const select = useCallback(
    (params: Record<string, string>) => setSearch(params, { replace: false }),
    [setSearch],
  );

  const loadAll = useCallback(async () => {
    const [o, g, c] = await Promise.all([
      api.get<WaOverview>("/api/whatsapp/overview"),
      api.get<WaGroup[]>("/api/whatsapp/groups"),
      api.get<WaChat[]>("/api/whatsapp/chats"),
    ]);
    setOverview(o);
    setGroups(g);
    setChats(c);
  }, []);

  useEffect(() => {
    void loadAll();
    void api.get<Party[]>("/api/parties").then(setParties);
    const t = setInterval(loadAll, 10000);
    return () => clearInterval(t);
  }, [loadAll]);

  // "?broadcast=<partyId>" (from a party page) opens the broadcast window for that party.
  useEffect(() => {
    const b = search.get("broadcast");
    if (b) {
      setBroadcast({ groupIds: [], partyId: Number(b) || null });
      const next = new URLSearchParams(search);
      next.delete("broadcast");
      setSearch(next, { replace: true });
    }
  }, [search, setSearch]);

  const toggleAgent = async (on: boolean) => {
    await api.put("/api/settings", { whatsapp_agent_enabled: on ? "true" : "false" });
    await loadAll();
  };

  /** Simulation: a new contact writes to the number (from a group message, or out of the blue). */
  const simulateContact = async (message?: GroupMessage) => {
    try {
      const c = await api.post<SimContact>("/api/whatsapp/sim/contact", { messageId: message?.id ?? null });
      setContact(c);
      setPaneKey(c.chatId);
      select({ tab: "chats" });
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    }
  };

  const onLeadCreated = useCallback(
    (id: number) => {
      setContact(null);
      select({ tab: "chats", chat: String(id) });
    },
    [select],
  );

  const onChanged = useCallback(() => {
    void loadAll();
  }, [loadAll]);

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;
  const communities = groups.filter((g) => g.kind === "community");
  const orderedGroups = useMemo(() => {
    const out: { g: WaGroup; indent: boolean }[] = [];
    for (const c of communities) {
      out.push({ g: c, indent: false });
      for (const g of groups.filter((x) => x.parentId === c.id)) out.push({ g, indent: true });
    }
    for (const g of groups.filter((x) => x.kind === "group" && !x.parentId)) out.push({ g, indent: false });
    return out;
  }, [groups, communities]);

  if (!overview) {
    return (
      <Center h={300}>
        <Loader color="green" />
      </Center>
    );
  }

  const showChat = tab === "chats" && (chatId || contact);
  const broadcastGroupIds = broadcast?.groupIds;

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>וואטסאפ</Title>
          <Text c="dimmed" fz="sm">
            המספר של העסק: הקבוצות שמחוברות אליו, הפרסומים בהן, והצ'אטים הפרטיים שהסוכן מנהל.
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setGroupForm({ group: null })}>
            חיבור קבוצה
          </Button>
          <Button color="green" leftSection={<IconSpeakerphone size={16} />} onClick={() => setBroadcast({ groupIds: [], partyId: null })}>
            פרסום מסיבה בקבוצות
          </Button>
        </Group>
      </Group>

      <DeviceCard
        overview={overview}
        onToggleAgent={async (on) => {
          await toggleAgent(on);
          await refreshMeta();
        }}
      />

      <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
        <Group h={680} gap={0} wrap="nowrap" align="stretch">
          <Stack w={340} gap={0} style={{ borderInlineEnd: "1px solid #e9edef", flex: "none" }}>
            <Tabs value={tab} onChange={(v) => select({ tab: v ?? "groups" })} color="green">
              <Tabs.List grow>
                <Tabs.Tab value="groups" leftSection={<IconUsersGroup size={16} />}>
                  קבוצות ({groups.length})
                </Tabs.Tab>
                <Tabs.Tab value="chats" leftSection={<IconBrandWhatsapp size={16} />}>
                  צ'אטים ({chats.length})
                </Tabs.Tab>
              </Tabs.List>
            </Tabs>
            <ScrollArea style={{ flex: 1 }}>
              {tab === "groups" ? (
                orderedGroups.length === 0 ? (
                  <Text c="dimmed" fz="sm" p="md" ta="center">
                    עוד לא חוברו קבוצות.
                  </Text>
                ) : (
                  orderedGroups.map(({ g, indent }) => (
                    <ListItem
                      key={g.id}
                      indent={indent}
                      active={g.id === groupId}
                      onClick={() => select({ tab: "groups", group: String(g.id) })}
                      avatar={
                        <Avatar color={g.kind === "community" ? "teal" : "green"} radius="xl" size={indent ? 34 : 40}>
                          {g.kind === "community" ? <IconUsersGroup size={18} /> : <IconUsers size={18} />}
                        </Avatar>
                      }
                      title={g.name}
                      subtitle={
                        g.lastMessage
                          ? g.lastMessage.text.split("\n")[0]!.replace(/\*/g, "")
                          : g.kind === "community"
                            ? `${g.groupCount} קבוצות · ${fmtNumber(g.members)} חברים`
                            : `${fmtNumber(g.members)} חברים`
                      }
                      side={
                        <Group gap={4} wrap="nowrap">
                          {g.scheduledCount > 0 && (
                            <Badge size="xs" color="grape" variant="light">
                              {g.scheduledCount} מתוזמן
                            </Badge>
                          )}
                          {g.lastMessage && (
                            <Text fz={11} c="dimmed">
                              {fmtRelative(g.lastMessage.at)}
                            </Text>
                          )}
                        </Group>
                      }
                    />
                  ))
                )
              ) : (
                <>
                  {contact && (
                    <ListItem
                      active
                      onClick={() => {}}
                      avatar={<Avatar color="gray" radius="xl" name={contact.name} />}
                      title={contact.name}
                      subtitle="כותב/ת…"
                    />
                  )}
                  {chats.length === 0 && !contact && (
                    <Text c="dimmed" fz="sm" p="md" ta="center">
                      עוד אין צ'אטים. לחצו על "סימולציית פנייה" בהודעה של קבוצה, או על הכפתור למטה.
                    </Text>
                  )}
                  {chats.map((c) => (
                    <ListItem
                      key={c.id}
                      active={c.id === chatId && !contact}
                      onClick={() => {
                        setContact(null);
                        setPaneKey(`lead-${c.id}`);
                        select({ tab: "chats", chat: String(c.id) });
                      }}
                      avatar={<Avatar color={c.simulated ? "gray" : "green"} radius="xl" name={c.name ?? c.waName ?? ""} />}
                      title={c.name ?? c.waName ?? fmtPhone(c.phone)}
                      subtitle={
                        c.preview
                          ? `${c.preview.role === "assistant" ? "🤖 " : c.preview.role === "human_agent" ? "🧑‍💼 " : ""}${c.preview.text.split("\n")[0]}`
                          : c.sourceGroupName ?? ""
                      }
                      side={
                        <Group gap={4} wrap="nowrap">
                          <Badge size="xs" variant="light" color={leadStageLabel[c.stage].color}>
                            {leadStageLabel[c.stage].label}
                          </Badge>
                          <Text fz={11} c="dimmed">
                            {fmtRelative(c.lastMessageAt ?? c.createdAt)}
                          </Text>
                        </Group>
                      }
                    />
                  ))}
                </>
              )}
            </ScrollArea>
            <Box p="sm" style={{ borderTop: "1px solid #e9edef" }}>
              {tab === "groups" ? (
                <Button fullWidth variant="light" color="green" leftSection={<IconPlus size={16} />} onClick={() => setGroupForm({ group: null })}>
                  חיבור קבוצה למספר
                </Button>
              ) : (
                <Button fullWidth variant="light" color="green" leftSection={<IconMessagePlus size={16} />} onClick={() => simulateContact()}>
                  סימולציה: לקוח חדש כותב למספר
                </Button>
              )}
            </Box>
          </Stack>

          <Box style={{ flex: 1, minWidth: 0 }}>
            {tab === "groups" && selectedGroup ? (
              <GroupPane
                group={selectedGroup}
                version={groupVersion}
                onEdit={() => setGroupForm({ group: selectedGroup })}
                onDeleted={() => {
                  select({ tab: "groups" });
                  void loadAll();
                }}
                onChanged={onChanged}
                onBroadcast={() => setBroadcast({ groupIds: [selectedGroup.id], partyId: null })}
                onMemberClick={(m) => void simulateContact(m)}
              />
            ) : showChat ? (
              <ChatPane
                key={paneKey || `lead-${chatId}`}
                leadId={contact ? null : chatId}
                contact={contact}
                onLeadCreated={onLeadCreated}
                onChanged={onChanged}
                onDeleted={() => {
                  select({ tab: "chats" });
                  void loadAll();
                }}
              />
            ) : (
              <Center h="100%" className="wa-chat">
                <Stack align="center" gap={6} maw={360}>
                  <IconBrandWhatsapp size={56} color="#25d366" />
                  <Text fw={600}>{tab === "groups" ? "בחרו קבוצה" : "בחרו צ'אט"}</Text>
                  <Text fz="sm" c="dimmed" ta="center">
                    {tab === "groups"
                      ? "בקבוצה רואים את הפרסומים שנשלחו אליה. לחיצה על הקישור בפרסום מדמה חבר/ת קבוצה שפונה לסוכן בפרטי."
                      : "כל צ'אט הוא ליד. הסוכן עונה, ואפשר להיכנס לשיחה בתור נציג."}
                  </Text>
                </Stack>
              </Center>
            )}
          </Box>
        </Group>
      </Paper>

      <GroupFormModal
        opened={groupForm !== null}
        onClose={() => setGroupForm(null)}
        group={groupForm?.group ?? null}
        groups={groups}
        onSaved={(g) => {
          void loadAll();
          select({ tab: "groups", group: String(g.id) });
        }}
      />
      <BroadcastModal
        opened={broadcast !== null}
        onClose={() => setBroadcast(null)}
        parties={parties}
        groups={groups}
        initialGroupIds={broadcastGroupIds}
        initialPartyId={broadcast?.partyId ?? null}
        onSent={(ids) => {
          void loadAll();
          setGroupVersion((v) => v + 1);
          if (!groupId || !ids.includes(groupId)) select({ tab: "groups", group: String(ids[0]) });
        }}
      />
    </Stack>
  );
}
