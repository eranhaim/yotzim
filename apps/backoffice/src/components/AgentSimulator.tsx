import { ActionIcon, Alert, Avatar, Box, Button, Chip, Grid, Group, Paper, ScrollArea, Stack, Switch, Text, Textarea } from "@mantine/core";
import { IconAlertTriangle, IconRefresh, IconSend } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { useMeta } from "../App";
import { api, type Lead, type LeadEvent, type Party, type TranscriptEntry } from "../api";
import { LeadProfileCard } from "./LeadProfileCard";
import { WaText } from "./WaText";

interface TurnResponse {
  reply: string;
  handoff: string | null;
  lead: Lead;
  transcript: TranscriptEntry[];
  events: LeadEvent[];
}

const SUGGESTIONS_FROM_PARTY = [
  "היי! ראיתי את הפוסט על המסיבה, אשמח לפרטים 🙌",
  "כמה עולה כרטיס?",
  "אני גר בחיפה, איך מגיעים?",
  "אנחנו 4 חברים, בני 24",
  "יקר לי קצת…",
  "יאללה, איך קונים?",
];
const SUGGESTIONS_GENERAL = [
  "היי, מה יש בסופ״ש הקרוב?",
  "אני אוהבת טראנס, במיוחד מסיבות טבע 🌲",
  "אני מהצפון, התקציב שלי עד 150",
  "אנחנו 3 חברות בנות 22",
  "יאללה, שלחי לינק",
  "אפשר לדבר עם נציג?",
];

export function AgentSimulator({ party }: { party: Party | null }) {
  const { meta } = useMeta();
  const [fromParty, setFromParty] = useState(Boolean(party));
  const [leadId, setLeadId] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" });
  }, [transcript, sending]);

  const reset = () => {
    setLeadId(null);
    setTranscript([]);
    setLead(null);
    setEvents([]);
    setError(null);
  };

  const send = async (msg: string) => {
    const body = msg.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setText("");
    setTranscript((t) => [...t, { role: "user", text: body, at: new Date().toISOString() }]);
    try {
      let id = leadId;
      if (!id) {
        id = (await api.post<{ leadId: number }>("/api/simulation", { partyId: fromParty && party ? party.id : null })).leadId;
        setLeadId(id);
      }
      const r = await api.post<TurnResponse>(`/api/simulation/${id}/message`, { text: body });
      setTranscript(r.transcript);
      setLead(r.lead);
      setEvents(r.events);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const suggestions = fromParty && party ? SUGGESTIONS_FROM_PARTY : SUGGESTIONS_GENERAL;

  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
          <Group justify="space-between" px="md" py="xs" bg="#008069" c="white">
            <Group gap="sm">
              <Avatar color="white" radius="xl" size={36}>
                🎉
              </Avatar>
              <div>
                <Text fw={600} lh={1.2}>
                  {meta.companyName}
                </Text>
                <Text fz="xs" opacity={0.85}>
                  {sending ? "מקליד/ה…" : "סוכן מכירות AI · סימולציה"}
                </Text>
              </div>
            </Group>
            <Button size="xs" variant="white" color="dark" leftSection={<IconRefresh size={14} />} onClick={reset} disabled={sending}>
              שיחה חדשה
            </Button>
          </Group>

          <ScrollArea h={460} viewportRef={viewport} className="wa-chat">
            <Stack gap={6} p="md">
              {transcript.length === 0 && (
                <Box className="wa-bubble system">
                  {fromParty && party
                    ? `הסימולציה מתחילה כאילו הליד הגיע מהפוסט של "${party.name}". כתבו הודעה כמו לקוח.`
                    : "כתבו הודעה כמו לקוח חדש שפונה לוואטסאפ של החברה."}
                </Box>
              )}
              {transcript.map((m, i) => (
                <Box
                  key={i}
                  className={`wa-bubble ${m.role === "user" ? "lead" : m.role === "assistant" ? "agent" : m.role === "human_agent" ? "human" : "system"}`}
                >
                  <WaText text={m.text} />
                  {m.role !== "system" && <div className="wa-time">{dayjs(m.at).format("HH:mm")}</div>}
                </Box>
              ))}
              {sending && (
                <Box className="wa-bubble agent">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </Box>
              )}
            </Stack>
          </ScrollArea>

          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />} radius={0}>
              {error}
            </Alert>
          )}

          <Box p="sm" bg="#f0f2f5">
            <Group gap={6} mb="xs" wrap="wrap">
              {suggestions.map((s) => (
                <Chip key={s} size="xs" checked={false} onChange={() => void send(s)} disabled={sending}>
                  {s}
                </Chip>
              ))}
            </Group>
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <Textarea
                style={{ flex: 1 }}
                placeholder="כתבו הודעה…"
                autosize
                minRows={1}
                maxRows={4}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                radius="xl"
              />
              <ActionIcon size={38} radius="xl" color="#008069" variant="filled" onClick={() => send(text)} loading={sending} aria-label="שליחה">
                <IconSend size={18} style={{ transform: "scaleX(-1)" }} />
              </ActionIcon>
            </Group>
          </Box>
        </Paper>
        {party && (
          <Switch
            mt="sm"
            label="הליד מגיע מהפוסט של המסיבה הזו (כמו לחיצה על קישור וואטסאפ מהפוסט)"
            checked={fromParty}
            onChange={(e) => {
              setFromParty(e.currentTarget.checked);
              reset();
            }}
          />
        )}
        {!meta.agentConfigured && (
          <Alert color="orange" mt="sm" title="הסוכן עוד לא מחובר">
            יש להגדיר ANTHROPIC_API_KEY בשרת כדי שהסוכן יענה.
          </Alert>
        )}
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 5 }}>
        {lead ? (
          <LeadProfileCard lead={lead} events={events} />
        ) : (
          <Paper withBorder p="md" radius="md">
            <Text fw={700} mb={4}>
              כרטיס ליד
            </Text>
            <Text fz="sm" c="dimmed">
              כאן יופיעו הפרטים שהסוכן לומד מהשיחה: טעם מוזיקלי, אזור, תקציב, גיל וכמה מגיעים. כל שינוי מסומן בצהוב בזמן אמת.
            </Text>
          </Paper>
        )}
      </Grid.Col>
    </Grid>
  );
}
