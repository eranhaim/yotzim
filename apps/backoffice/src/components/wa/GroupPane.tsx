import { ActionIcon, Avatar, Badge, Box, Button, Group, Image, ScrollArea, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconClock,
  IconEdit,
  IconHandFinger,
  IconSend,
  IconSpeakerphone,
  IconTrash,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useMeta } from "../../App";
import { api, type GroupMessage, type WaGroup } from "../../api";
import { fmtDateTime, fmtNumber } from "../../labels";
import { WaText } from "../WaText";

interface Props {
  group: WaGroup;
  /** Bumped by the parent after a broadcast, to reload the messages. */
  version: number;
  onEdit: () => void;
  onDeleted: () => void;
  onChanged: () => void;
  onBroadcast: () => void;
  /** Simulation: a member of the group clicks the chat link in this message. */
  onMemberClick: (message: GroupMessage) => void;
}

export function GroupPane({ group, version, onEdit, onDeleted, onChanged, onBroadcast, onMemberClick }: Props) {
  const { meta } = useMeta();
  const [messages, setMessages] = useState<GroupMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setMessages(await api.get<GroupMessage[]>(`/api/whatsapp/groups/${group.id}/messages`));
  }, [group.id]);

  useEffect(() => {
    setMessages(null);
    void load();
    const t = setInterval(load, 15000); // scheduled messages go out in the background
    return () => clearInterval(t);
  }, [load, version]);

  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [messages?.length]);

  const sendText = async () => {
    setSending(true);
    try {
      await api.post("/api/whatsapp/broadcast", { groupIds: [group.id], partyId: null, text, mediaId: null, scheduledAt: null });
      setText("");
      await load();
      onChanged();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  const sendNow = async (m: GroupMessage) => {
    await api.post(`/api/whatsapp/messages/${m.id}/send-now`);
    await load();
    onChanged();
  };

  const cancel = (m: GroupMessage) =>
    modals.openConfirmModal({
      title: "ביטול הודעה מתוזמנת",
      children: <Text fz="sm">למחוק את ההודעה המתוזמנת?</Text>,
      labels: { confirm: "מחיקה", cancel: "חזרה" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await api.del(`/api/whatsapp/messages/${m.id}`);
        await load();
        onChanged();
      },
    });

  const remove = () =>
    modals.openConfirmModal({
      title: "ניתוק קבוצה",
      children: <Text fz="sm">לנתק את "{group.name}" מהמספר? ההודעות של הקבוצה יימחקו מהמערכת.</Text>,
      labels: { confirm: "ניתוק", cancel: "ביטול" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await api.del(`/api/whatsapp/groups/${group.id}`);
        onDeleted();
      },
    });

  /** A click on the wa.me link inside an announcement starts the simulated private chat. */
  const interceptLinks = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    const bubble = (e.target as HTMLElement).closest<HTMLElement>("[data-msg]");
    if (!a || !bubble || !(a.href.includes("/go/") || a.href.startsWith("https://wa.me/"))) return;
    const m = messages?.find((x) => x.id === Number(bubble.dataset.msg));
    if (!m?.partyId || m.status !== "sent") return;
    e.preventDefault();
    onMemberClick(m);
  };

  const subtitle =
    group.kind === "community"
      ? `קהילה · ${group.groupCount} קבוצות · ${fmtNumber(group.members)} חברים`
      : `${fmtNumber(group.members)} חברים${group.parentName ? ` · בקהילה ${group.parentName}` : ""}`;

  return (
    <Stack gap={0} h="100%">
      <Group justify="space-between" px="md" py={8} bg="#f0f2f5" wrap="nowrap" style={{ borderBottom: "1px solid #e9edef" }}>
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Avatar color={group.kind === "community" ? "teal" : "green"} radius="xl">
            {group.kind === "community" ? <IconUsersGroup size={20} /> : <IconUsers size={20} />}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {group.name}
            </Text>
            <Text fz="xs" c="dimmed" truncate>
              {subtitle}
              {group.region ? ` · ${group.region}` : ""}
            </Text>
          </div>
        </Group>
        <Group gap={4} wrap="nowrap">
          <Tooltip label="עריכה">
            <ActionIcon variant="subtle" color="gray" onClick={onEdit}>
              <IconEdit size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="ניתוק מהמספר">
            <ActionIcon variant="subtle" color="red" onClick={remove}>
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea style={{ flex: 1 }} viewportRef={viewport} className="wa-chat wa-business">
        <Stack gap={8} p="md" onClickCapture={interceptLinks}>
          <Box className="wa-bubble system">
            כאן מוצגות ההודעות שהעסק שולח לקבוצה. לחיצה על הקישור בהודעה מדמה חבר/ת קבוצה שפונה לצ'אט הפרטי.
          </Box>
          {messages?.length === 0 && (
            <Text c="dimmed" ta="center" fz="sm" mt="lg">
              עוד לא נשלחו הודעות לקבוצה.
            </Text>
          )}
          {messages?.map((m) => (
            <Box
              key={m.id}
              data-msg={m.id}
              className="wa-bubble agent"
              style={{ maxWidth: 440, opacity: m.status === "scheduled" ? 0.75 : 1 }}
            >
              {m.status === "scheduled" && (
                <Group gap={4} mb={4}>
                  <IconClock size={14} color="var(--mantine-color-grape-6)" />
                  <Text fz={12} fw={600} c="grape.7">
                    מתוזמן ל{fmtDateTime(m.scheduledAt)}
                  </Text>
                </Group>
              )}
              {m.media && <Image src={m.media.url} radius="sm" mb={6} mah={280} fit="cover" />}
              <WaText text={m.text} />
              <Group justify="space-between" gap={6} mt={4} wrap="nowrap">
                <Group gap={4}>
                  {m.simulated && m.status === "sent" && (
                    <Badge size="xs" variant="light" color="blue">
                      סימולציה
                    </Badge>
                  )}
                  {m.status === "failed" && (
                    <Tooltip label={m.error ?? ""} multiline w={260}>
                      <Badge size="xs" color="red">
                        נכשל
                      </Badge>
                    </Tooltip>
                  )}
                </Group>
                <span className="wa-time">
                  {dayjs(m.sentAt ?? m.scheduledAt ?? m.createdAt).format("D.M HH:mm")} {m.status === "sent" ? "✓✓" : ""}
                </span>
              </Group>

              {m.status === "sent" && m.partyId && (
                <Group justify="space-between" gap={6} mt={6} pt={6} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }} wrap="nowrap">
                  <Text fz={12} c="dimmed">
                    {m.leads > 0 ? `💬 ${m.leads} פניות לצ'אט מהקבוצה` : "עוד אין פניות מההודעה"}
                  </Text>
                  <Button size="compact-xs" variant="white" color="green" leftSection={<IconHandFinger size={14} />} onClick={() => onMemberClick(m)}>
                    סימולציית פנייה
                  </Button>
                </Group>
              )}
              {(m.status === "scheduled" || m.status === "failed") && (
                <Group justify="flex-end" gap={6} mt={6}>
                  <Button size="compact-xs" variant="white" color="red" onClick={() => cancel(m)}>
                    מחיקה
                  </Button>
                  <Button size="compact-xs" color="green" onClick={() => sendNow(m)}>
                    {m.status === "failed" ? "ניסיון חוזר" : "שליחה עכשיו"}
                  </Button>
                </Group>
              )}
            </Box>
          ))}
        </Stack>
      </ScrollArea>

      <Group p="sm" gap="xs" bg="#f0f2f5" align="flex-end" wrap="nowrap">
        <Tooltip label="פרסום מסיבה בקבוצה">
          <ActionIcon size={38} radius="xl" variant="light" color="green" onClick={onBroadcast} aria-label="פרסום מסיבה">
            <IconSpeakerphone size={20} />
          </ActionIcon>
        </Tooltip>
        <Textarea
          style={{ flex: 1 }}
          placeholder={meta.whatsappLive ? "הודעה לקבוצה" : "הודעה לקבוצה (סימולציה)"}
          autosize
          minRows={1}
          maxRows={4}
          radius="xl"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && text.trim()) {
              e.preventDefault();
              void sendText();
            }
          }}
        />
        <ActionIcon size={38} radius="xl" color="#008069" variant="filled" onClick={sendText} loading={sending} disabled={!text.trim()} aria-label="שליחה">
          <IconSend size={18} style={{ transform: "scaleX(-1)" }} />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
