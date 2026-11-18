import { ActionIcon, Anchor, Badge, Box, Button, CopyButton, Group, Loader, Paper, Stack, Tabs, Text, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconArrowRight,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconCheck,
  IconCopy,
  IconEdit,
  IconExternalLink,
  IconMapPin,
  IconRobot,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMeta } from "../App";
import { api, type Party } from "../api";
import { AgentSimulator } from "../components/AgentSimulator";
import { PartyForm, partyToValues, valuesToInput, type PartyFormValues } from "../components/PartyForm";
import { PostCalendar } from "../components/PostCalendar";
import { fmtDateTime, partyStatusLabel } from "../labels";
import { PartyCover } from "./PartiesPage";

function WhatsAppEntryLink({ party }: { party: Party }) {
  const { meta } = useMeta();
  const number = meta.whatsappBusinessNumber.replace(/\D/g, "");
  if (!number) {
    return (
      <Text fz="xs" c="dimmed">
        להפקת קישור וואטסאפ למסיבה, הגדירו את מספר הוואטסאפ של העסק בהגדרות.
      </Text>
    );
  }
  const text = `היי! ראיתי את "${party.name}" ואשמח לפרטים 🙌 (#${party.id})`;
  const link = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  return (
    <Group gap={6} wrap="nowrap">
      <IconBrandWhatsapp size={16} color="var(--mantine-color-green-7)" />
      <Text fz="xs" c="dimmed">
        קישור וואטסאפ לפוסט / לביו:
      </Text>
      <CopyButton value={link}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "הועתק" : "העתקה"}>
            <ActionIcon size="sm" variant="light" color={copied ? "teal" : "green"} onClick={copy}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

export function PartyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [party, setParty] = useState<Party | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [values, setValues] = useState<PartyFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const tab = search.get("tab") ?? "schedule";

  const load = useCallback(async () => {
    const [p, all] = await Promise.all([api.get<Party>(`/api/parties/${id}`), api.get<Party[]>("/api/parties")]);
    setParty(p);
    setParties(all);
    setValues(partyToValues(p));
  }, [id]);

  useEffect(() => {
    load().catch(() => navigate("/parties"));
  }, [load, navigate]);

  if (!party || !values) return <Loader />;

  const save = async () => {
    setSaving(true);
    try {
      const p = await api.put<Party>(`/api/parties/${party.id}`, valuesToInput(values));
      setParty(p);
      setValues(partyToValues(p));
      notifications.show({ color: "teal", message: "השינויים נשמרו" });
    } catch (err) {
      notifications.show({ color: "red", title: "לא נשמר", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    modals.openConfirmModal({
      title: "מחיקת מסיבה",
      children: <Text fz="sm">למחוק את "{party.name}"? פוסטים מתוזמנים יישארו בלוח ללא שיוך למסיבה.</Text>,
      labels: { confirm: "מחיקה", cancel: "ביטול" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await api.del(`/api/parties/${party.id}`);
        navigate("/parties");
      },
    });

  return (
    <Stack>
      <Anchor fz="sm" onClick={() => navigate("/parties")}>
        <Group gap={4}>
          <IconArrowRight size={14} /> כל המסיבות
        </Group>
      </Anchor>

      <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
        <Group wrap="nowrap" align="stretch" gap={0}>
          <Box w={180} visibleFrom="sm" style={{ flex: "none" }}>
            <PartyCover party={party} h={150} />
          </Box>
          <Stack gap={6} p="md" style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs">
              <Title order={3}>{party.name}</Title>
              <Badge color={partyStatusLabel[party.status].color} variant="light">
                {partyStatusLabel[party.status].label}
              </Badge>
            </Group>
            <Group gap="lg" c="dimmed">
              <Group gap={6}>
                <IconCalendarEvent size={16} />
                <Text fz="sm">{fmtDateTime(party.startsAt)}</Text>
              </Group>
              <Group gap={6}>
                <IconMapPin size={16} />
                <Text fz="sm">{[party.venueName, party.city, party.region].filter(Boolean).join(" · ") || "—"}</Text>
              </Group>
              {party.minPrice && <Text fz="sm">החל מ-₪{party.minPrice}</Text>}
            </Group>
            <Group gap={4}>
              {party.categories.map((c) => (
                <Badge key={c.id} color={c.color} variant="dot" size="sm">
                  {c.name}
                </Badge>
              ))}
            </Group>
            <Group gap="lg">
              {party.ticketUrl && (
                <Anchor href={party.ticketUrl} target="_blank" fz="xs">
                  <Group gap={4}>
                    עמוד הכרטיסים <IconExternalLink size={12} />
                  </Group>
                </Anchor>
              )}
              <WhatsAppEntryLink party={party} />
            </Group>
          </Stack>
        </Group>
      </Paper>

      <Tabs value={tab} onChange={(t) => setSearch({ tab: t ?? "schedule" }, { replace: true })} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="schedule" leftSection={<IconCalendarEvent size={16} />}>
            לוח פרסומים
          </Tabs.Tab>
          <Tabs.Tab value="agent" leftSection={<IconRobot size={16} />}>
            סימולציית סוכן מכירות
          </Tabs.Tab>
          <Tabs.Tab value="details" leftSection={<IconEdit size={16} />}>
            עריכת פרטים
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="schedule" pt="md">
          <PostCalendar parties={parties} partyId={party.id} onChanged={load} />
        </Tabs.Panel>

        <Tabs.Panel value="agent" pt="md">
          <AgentSimulator party={party} />
        </Tabs.Panel>

        <Tabs.Panel value="details" pt="md">
          <PartyForm
            values={values}
            onChange={setValues}
            onSubmit={save}
            submitting={saving}
            submitLabel="שמירת שינויים"
            extraActions={
              <Button variant="subtle" color="red" onClick={remove} size="md">
                מחיקה
              </Button>
            }
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
