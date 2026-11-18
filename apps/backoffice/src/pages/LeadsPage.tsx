import {
  Badge,
  Box,
  Button,
  Drawer,
  Grid,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconBrandWhatsapp, IconFlask } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Lead, type LeadDetails } from "../api";
import { LeadProfileCard } from "../components/LeadProfileCard";
import { WaText } from "../components/WaText";
import { fmtRelative, leadStageLabel } from "../labels";

function LeadDrawer({ leadId, onClose, onChanged }: { leadId: number | null; onClose: () => void; onChanged: () => void }) {
  const [details, setDetails] = useState<LeadDetails | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (leadId) setDetails(await api.get<LeadDetails>(`/api/leads/${leadId}`));
  }, [leadId]);

  useEffect(() => {
    setDetails(null);
    void load();
    if (!leadId) return;
    const t = setInterval(load, 8000); // live view of WhatsApp conversations
    return () => clearInterval(t);
  }, [leadId, load]);

  const togglePause = async (paused: boolean) => {
    await api.patch(`/api/leads/${leadId}`, { botPaused: paused });
    await load();
    onChanged();
  };

  const sendReply = async () => {
    setSending(true);
    try {
      await api.post(`/api/leads/${leadId}/send`, { text: reply });
      setReply("");
      await load();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  const remove = () =>
    modals.openConfirmModal({
      title: "מחיקת ליד",
      children: <Text fz="sm">למחוק את הליד ואת כל השיחה?</Text>,
      labels: { confirm: "מחיקה", cancel: "ביטול" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await api.del(`/api/leads/${leadId}`);
        onChanged();
        onClose();
      },
    });

  const lead = details?.lead;
  return (
    <Drawer opened={leadId !== null} onClose={onClose} position="left" size="xl" title={<Text fw={700}>{lead ? lead.name ?? lead.waName ?? lead.phone ?? `ליד #${lead.id}` : "…"}</Text>}>
      {!details || !lead ? (
        <Loader />
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
              <ScrollArea h={480} className="wa-chat">
                <Stack gap={6} p="md">
                  {details.transcript.length === 0 && <Text c="dimmed">אין הודעות.</Text>}
                  {details.transcript.map((m, i) => (
                    <Box
                      key={i}
                      className={`wa-bubble ${m.role === "user" ? "lead" : m.role === "assistant" ? "agent" : m.role === "human_agent" ? "human" : "system"}`}
                    >
                      {m.role === "human_agent" && (
                        <Text fz={11} fw={600} c="orange.8">
                          נציג
                        </Text>
                      )}
                      <WaText text={m.text} />
                      {m.role !== "system" && <div className="wa-time">{dayjs(m.at).format("D.M HH:mm")}</div>}
                    </Box>
                  ))}
                </Stack>
              </ScrollArea>
              {lead.channel === "whatsapp" && (
                <Group p="sm" gap="xs" align="flex-end" bg="#f0f2f5" wrap="nowrap">
                  <Textarea
                    style={{ flex: 1 }}
                    autosize
                    minRows={1}
                    maxRows={4}
                    placeholder="תשובה של נציג (נשלחת בוואטסאפ ומשהה את הבוט)"
                    value={reply}
                    onChange={(e) => setReply(e.currentTarget.value)}
                  />
                  <Button onClick={sendReply} loading={sending} disabled={!reply.trim()} color="green">
                    שליחה
                  </Button>
                </Group>
              )}
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack>
              {lead.channel === "whatsapp" && (
                <Paper withBorder p="sm" radius="md">
                  <Switch
                    label={lead.botPaused ? "הבוט מושהה: נציג מטפל" : "הבוט עונה לליד הזה"}
                    checked={!lead.botPaused}
                    onChange={(e) => togglePause(!e.currentTarget.checked)}
                    color="green"
                  />
                  {lead.phone && (
                    <Text fz="xs" c="dimmed" mt={6} dir="ltr" ta="right">
                      +{lead.phone}
                    </Text>
                  )}
                </Paper>
              )}
              {lead.channel === "whatsapp" && (
                <Button variant="light" color="green" leftSection={<IconBrandWhatsapp size={16} />} onClick={() => navigate(`/whatsapp?tab=chats&chat=${lead.id}`)}>
                  פתיחה במסך הוואטסאפ
                </Button>
              )}
              <LeadProfileCard lead={lead} events={details.events} />
              <Button variant="subtle" color="red" onClick={remove}>
                מחיקת ליד
              </Button>
            </Stack>
          </Grid.Col>
        </Grid>
      )}
    </Drawer>
  );
}

export function LeadsPage() {
  const [channel, setChannel] = useState<"all" | "whatsapp" | "simulation">("all");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLeads(await api.get<Lead[]>(`/api/leads${channel === "all" ? "" : `?channel=${channel}`}`));
  }, [channel]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>לידים ושיחות</Title>
          <Text c="dimmed" fz="sm">
            כל מי שדיבר עם סוכן המכירות, עם הפרטים שהסוכן תיעד.
          </Text>
        </div>
        <SegmentedControl
          value={channel}
          onChange={(v) => setChannel(v as typeof channel)}
          data={[
            { value: "all", label: "הכל" },
            { value: "whatsapp", label: "וואטסאפ" },
            { value: "simulation", label: "סימולציות" },
          ]}
        />
      </Group>

      {!leads ? (
        <Loader />
      ) : leads.length === 0 ? (
        <Paper withBorder p="xl" radius="md">
          <Text c="dimmed" ta="center">
            עוד אין לידים. נסו את סימולציית הסוכן בעמוד של מסיבה, או חברו את הוואטסאפ בהגדרות.
          </Text>
        </Paper>
      ) : (
        <Paper withBorder radius="md">
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ליד</Table.Th>
                  <Table.Th>שלב</Table.Th>
                  <Table.Th>טעם מוזיקלי</Table.Th>
                  <Table.Th>אזור</Table.Th>
                  <Table.Th>תקציב</Table.Th>
                  <Table.Th>מסיבה</Table.Th>
                  <Table.Th>הודעה אחרונה</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {leads.map((l) => (
                  <Table.Tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(l.id)}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        {l.channel === "whatsapp" ? (
                          <IconBrandWhatsapp size={16} color="var(--mantine-color-green-7)" />
                        ) : (
                          <IconFlask size={16} color="var(--mantine-color-gray-6)" />
                        )}
                        <Text fz="sm" fw={500}>
                          {l.name ?? l.waName ?? (l.phone ? `+${l.phone}` : `סימולציה #${l.id}`)}
                        </Text>
                        {l.sourceGroupName && (
                          <Text fz="xs" c="dimmed" truncate>
                            · {l.sourceGroupName}
                          </Text>
                        )}
                        {l.botPaused && (
                          <Badge size="xs" color="orange" variant="light">
                            נציג
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={leadStageLabel[l.stage].color} variant="light">
                        {leadStageLabel[l.stage].label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{l.genres.join(", ") || "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{l.region ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{l.budget ? `₪${l.budget}` : "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" lineClamp={1}>
                        {l.interestedPartyName ?? l.sourcePartyName ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c="dimmed">
                        {fmtRelative(l.lastMessageAt ?? l.createdAt)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      <LeadDrawer leadId={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </Stack>
  );
}
