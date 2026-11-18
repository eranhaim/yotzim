import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Chip,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconSend, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type LeadDetails, type SimContact, type TranscriptEntry } from "../../api";
import { fmtPhone, leadStageLabel } from "../../labels";
import { LeadProfileCard } from "../LeadProfileCard";
import { WaText } from "../WaText";

const CUSTOMER_SUGGESTIONS = [
  "כמה עולה כרטיס?",
  "אני מחיפה, יש הסעה?",
  "אנחנו 4 חברים, בני 23",
  "אני יותר בקטע של טכנו",
  "יקר לי קצת…",
  "יאללה, איך קונים?",
  "אפשר לדבר עם מישהו מהצוות?",
];

interface Props {
  /** An existing chat… */
  leadId: number | null;
  /** …or a new simulated contact who is about to send the first message. */
  contact: SimContact | null;
  onLeadCreated: (leadId: number) => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export function ChatPane({ leadId, contact, onLeadCreated, onChanged, onDeleted }: Props) {
  const [details, setDetails] = useState<LeadDetails | null>(null);
  const [pending, setPending] = useState<TranscriptEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [as, setAs] = useState<"customer" | "staff">("customer");
  const [text, setText] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (!leadId || busy.current) return;
    const d = await api.get<LeadDetails>(`/api/leads/${leadId}`);
    if (!busy.current) setDetails(d);
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    setDetails((d) => (d?.lead.id === leadId ? d : null));
    setError(null);
    void load();
    const t = setInterval(load, 4000); // replies and real WhatsApp messages arrive in the background
    return () => clearInterval(t);
  }, [leadId, load]);

  const lead = details?.lead ?? null;
  const simulated = contact ? true : Boolean(lead?.simulated);
  useEffect(() => {
    if (lead && !lead.simulated) setAs("staff");
  }, [lead?.id, lead?.simulated]); // eslint-disable-line react-hooks/exhaustive-deps

  const transcript = [...(details?.transcript ?? []), ...pending];
  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" });
  }, [transcript.length, sending]);

  const sendAsCustomer = useCallback(
    async (body: string) => {
      const chatId = contact?.chatId ?? (lead?.phone ? `${lead.phone}@c.us` : null);
      if (!chatId || busy.current) return;
      busy.current = true;
      setSending(true);
      setError(null);
      setPending([{ role: "user", text: body, at: new Date().toISOString() }]);
      try {
        const r = await api.post<LeadDetails>("/api/whatsapp/sim/inbound", {
          chatId,
          name: contact?.name ?? lead?.waName ?? null,
          text: body,
        });
        setDetails(r);
        const last = r.transcript.at(-1);
        const lastEvent = r.events.at(-1);
        if (last?.role === "user" && lastEvent?.type === "agent_error") setError(String(lastEvent.data.message ?? "הסוכן לא ענה"));
        if (!leadId) onLeadCreated(r.lead.id);
        onChanged();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setPending([]);
        busy.current = false;
        setSending(false);
      }
    },
    [contact, lead, leadId, onLeadCreated, onChanged],
  );

  // A new simulated contact sends the first message at once (like a click on the link in the group).
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (contact && started.current !== contact.chatId) {
      started.current = contact.chatId;
      setDetails(null);
      void sendAsCustomer(contact.text);
    }
  }, [contact, sendAsCustomer]);

  const sendAsStaff = async (body: string) => {
    if (!leadId) return;
    setSending(true);
    try {
      await api.post(`/api/leads/${leadId}/send`, { text: body });
      await load();
      onChanged();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  const send = (body: string) => {
    const t = body.trim();
    if (!t || sending) return;
    setText("");
    void (as === "customer" && simulated ? sendAsCustomer(t) : sendAsStaff(t));
  };

  const togglePause = async (paused: boolean) => {
    if (!leadId) return;
    await api.patch(`/api/leads/${leadId}`, { botPaused: paused });
    await load();
    onChanged();
  };

  const remove = () =>
    modals.openConfirmModal({
      title: "מחיקת צ'אט",
      children: <Text fz="sm">למחוק את הצ'אט ואת הליד?</Text>,
      labels: { confirm: "מחיקה", cancel: "ביטול" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await api.del(`/api/leads/${leadId}`);
        onDeleted();
      },
    });

  const name = lead?.name ?? lead?.waName ?? contact?.name ?? "…";
  const phone = lead?.phone ?? contact?.phone ?? null;

  if (leadId && !details && !contact) {
    return (
      <Group justify="center" h="100%">
        <Loader color="green" />
      </Group>
    );
  }

  return (
    <Group h="100%" gap={0} wrap="nowrap" align="stretch">
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" px="md" py={8} bg="#f0f2f5" wrap="nowrap" style={{ borderBottom: "1px solid #e9edef" }}>
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar color="gray" radius="xl" name={name} />
            <div style={{ minWidth: 0 }}>
              <Group gap={6} wrap="nowrap">
                <Text fw={600} truncate>
                  {name}
                </Text>
                {simulated && (
                  <Badge size="xs" variant="light" color="blue">
                    סימולציה
                  </Badge>
                )}
                {lead && (
                  <Badge size="xs" variant="light" color={leadStageLabel[lead.stage].color}>
                    {leadStageLabel[lead.stage].label}
                  </Badge>
                )}
              </Group>
              <Text fz="xs" c="dimmed" dir="ltr" ta="right">
                {sending && as === "customer" ? "הסוכן מקליד…" : fmtPhone(phone)}
              </Text>
            </div>
          </Group>
          {lead && (
            <Group gap="xs" wrap="nowrap">
              <Switch
                size="sm"
                color="green"
                label={lead.botPaused ? "נציג מטפל" : "הבוט עונה"}
                checked={!lead.botPaused}
                onChange={(e) => togglePause(!e.currentTarget.checked)}
              />
              <Tooltip label="מחיקת הצ'אט">
                <ActionIcon variant="subtle" color="red" onClick={remove}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>

        <ScrollArea style={{ flex: 1 }} viewportRef={viewport} className="wa-chat wa-business">
          <Stack gap={6} p="md">
            {lead?.sourceGroupName && (
              <Box className="wa-bubble system">
                הגיע/ה מהקבוצה "{lead.sourceGroupName}"{lead.sourcePartyName ? `, מההודעה על "${lead.sourcePartyName}"` : ""}
              </Box>
            )}
            {transcript.map((m, i) => (
              <Box
                key={i}
                className={`wa-bubble ${m.role === "user" ? "lead" : m.role === "assistant" ? "agent" : m.role === "human_agent" ? "human" : "system"}`}
              >
                {m.role === "assistant" && (
                  <Text fz={11} fw={600} c="green.8">
                    🤖 סוכן AI
                  </Text>
                )}
                {m.role === "human_agent" && (
                  <Text fz={11} fw={600} c="orange.8">
                    🧑‍💼 נציג
                  </Text>
                )}
                <WaText text={m.text} />
                {m.role !== "system" && <div className="wa-time">{dayjs(m.at).format("HH:mm")}</div>}
              </Box>
            ))}
            {sending && as === "customer" && (
              <Box className="wa-bubble agent">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </Box>
            )}
          </Stack>
        </ScrollArea>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} radius={0} withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box p="sm" bg="#f0f2f5">
          {simulated && (
            <Group justify="space-between" mb="xs" gap="xs">
              <SegmentedControl
                size="xs"
                value={as}
                onChange={(v) => setAs(v as "customer" | "staff")}
                data={[
                  { value: "customer", label: "🙋 כתיבה בתור הלקוח" },
                  { value: "staff", label: "🧑‍💼 כתיבה בתור נציג" },
                ]}
              />
              {as === "staff" && (
                <Text fz="xs" c="dimmed">
                  הודעה של נציג עוצרת את הבוט בצ'אט הזה
                </Text>
              )}
            </Group>
          )}
          {simulated && as === "customer" && (
            <Group gap={6} mb="xs" wrap="wrap">
              {CUSTOMER_SUGGESTIONS.map((s) => (
                <Chip key={s} size="xs" checked={false} onChange={() => send(s)} disabled={sending}>
                  {s}
                </Chip>
              ))}
            </Group>
          )}
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <Textarea
              style={{ flex: 1 }}
              placeholder={as === "customer" && simulated ? "כתבו הודעה בשם הלקוח…" : "תשובה של נציג (משהה את הבוט)"}
              autosize
              minRows={1}
              maxRows={4}
              radius="xl"
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            <ActionIcon
              size={38}
              radius="xl"
              color={as === "customer" && simulated ? "#008069" : "orange"}
              variant="filled"
              onClick={() => send(text)}
              loading={sending}
              disabled={!text.trim()}
              aria-label="שליחה"
            >
              <IconSend size={18} style={{ transform: "scaleX(-1)" }} />
            </ActionIcon>
          </Group>
        </Box>
      </Stack>

      <Box w={320} visibleFrom="lg" p="sm" style={{ borderInlineStart: "1px solid #e9edef", overflowY: "auto" }} bg="gray.0">
        {lead ? (
          <LeadProfileCard lead={lead} events={details?.events ?? []} />
        ) : (
          <Text fz="sm" c="dimmed" p="sm">
            כרטיס הליד יופיע אחרי ההודעה הראשונה.
          </Text>
        )}
      </Box>
    </Group>
  );
}
