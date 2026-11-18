import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Grid,
  Group,
  Image,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconSparkles, IconSpeakerphone } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMeta } from "../../App";
import { api, type Party, type WaGroup } from "../../api";
import { fmtNumber, pickerToIso } from "../../labels";
import { WaText } from "../WaText";

export const LINK_TOKEN = "{{קישור}}";

interface Props {
  opened: boolean;
  onClose: () => void;
  onSent: (groupIds: number[]) => void;
  parties: Party[];
  groups: WaGroup[];
  initialGroupIds?: number[];
  initialPartyId?: number | null;
}

/** Groups whose music styles or area fit the party, plus the general groups. */
function recommendedGroups(party: Party, groups: WaGroup[]) {
  const cats = new Set(party.categories.map((c) => c.id));
  return groups
    .filter((g) => g.kind === "group")
    .filter((g) => {
      const general = g.categoryIds.length === 0 && !g.region;
      return general || (g.region && g.region === party.region) || g.categoryIds.some((c) => cats.has(c));
    })
    .map((g) => g.id);
}

export function BroadcastModal({ opened, onClose, onSent, parties, groups, initialGroupIds, initialPartyId }: Props) {
  const { meta } = useMeta();
  const [partyId, setPartyId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [withCover, setWithCover] = useState(true);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const party = parties.find((p) => p.id === partyId) ?? null;

  // Latest props for the effects below, which must run only when the window opens or the party changes.
  const latest = useRef({ parties, groups, initialGroupIds, initialPartyId });
  latest.current = { parties, groups, initialGroupIds, initialPartyId };

  useEffect(() => {
    if (!opened) {
      setPartyId(null); // so that opening again with the same party loads its text again
      return;
    }
    setPartyId(latest.current.initialPartyId ?? null);
    setGroupIds(latest.current.initialGroupIds ?? []);
    setText("");
    setMode("now");
    setWhen(null);
    setWithCover(true);
  }, [opened]);

  // A new party: load the ready text, and suggest groups when none were chosen.
  useEffect(() => {
    if (!opened || !partyId) return;
    void api.get<{ text: string }>(`/api/whatsapp/announcement?partyId=${partyId}`).then((r) => setText(r.text));
    const { parties: ps, groups: gs, initialGroupIds: initial } = latest.current;
    const p = ps.find((x) => x.id === partyId);
    if (p && !initial?.length) setGroupIds(recommendedGroups(p, gs));
    // Runs again once when the parties and groups arrive (the window can open before they load).
  }, [opened, partyId, parties.length > 0, groups.length > 0]);

  const writeWithAi = async () => {
    if (!partyId) return;
    setAiBusy(true);
    try {
      setText((await api.post<{ text: string }>("/api/whatsapp/announcement/ai", { partyId })).text);
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setAiBusy(false);
    }
  };

  const reach = useMemo(
    () => groups.filter((g) => groupIds.includes(g.id)).reduce((s, g) => s + g.members, 0),
    [groups, groupIds],
  );

  const send = async () => {
    setSending(true);
    try {
      await api.post("/api/whatsapp/broadcast", {
        groupIds,
        partyId,
        text,
        mediaId: withCover && party?.cover ? party.cover.id : null,
        scheduledAt: mode === "later" ? pickerToIso(when) : null,
      });
      notifications.show({
        color: "teal",
        message:
          mode === "later"
            ? `ההודעה תוזמנה ל-${groupIds.length} קבוצות`
            : `ההודעה נשלחה ל-${groupIds.length} קבוצות${meta.whatsappLive ? "" : " (סימולציה)"}`,
      });
      onSent(groupIds);
      onClose();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  const recommended = party ? new Set(recommendedGroups(party, groups)) : new Set<number>();
  const communities = groups.filter((g) => g.kind === "community");
  const standalone = groups.filter((g) => g.kind === "group" && !g.parentId);
  const sortedParties = [...parties].sort((a, b) => (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9"));
  const previewText = party
    ? text.replaceAll(LINK_TOKEN, `${window.location.origin}/go/${party.id}/${groupIds[0] ?? 1}`)
    : text.replaceAll(LINK_TOKEN, "");

  const groupBox = (g: WaGroup) => (
    <Checkbox
      key={g.id}
      value={String(g.id)}
      label={
        <Group gap={6} wrap="nowrap">
          <Text fz="sm">{g.name}</Text>
          <Text fz="xs" c="dimmed">
            {fmtNumber(g.members)}
          </Text>
          {recommended.has(g.id) && (
            <Badge size="xs" color="green" variant="light">
              מתאימה
            </Badge>
          )}
        </Group>
      }
    />
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={1100}
      title={
        <Group gap={8}>
          <IconSpeakerphone size={20} />
          <Text fw={700}>פרסום בקבוצות וואטסאפ</Text>
        </Group>
      }
    >
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack>
            <Select
              label="מסיבה"
              placeholder="הודעה כללית (בלי מסיבה)"
              searchable
              clearable
              data={sortedParties.map((p) => ({
                value: String(p.id),
                label: `${p.name}${p.startsAt ? ` · ${dayjs(p.startsAt).format("D.M")}` : ""}`,
              }))}
              value={partyId ? String(partyId) : null}
              onChange={(v) => setPartyId(v ? Number(v) : null)}
            />
            <Textarea
              label="טקסט ההודעה"
              description={party ? `${LINK_TOKEN} יוחלף בקישור לצ'אט פרטי, עם קוד של המסיבה ושל הקבוצה` : undefined}
              autosize
              minRows={8}
              maxRows={14}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
            />
            <Group justify="space-between">
              <Button
                variant="light"
                color="grape"
                leftSection={<IconSparkles size={16} />}
                onClick={writeWithAi}
                loading={aiBusy}
                disabled={!partyId || !meta.agentConfigured}
              >
                כתיבה עם AI
              </Button>
              {party?.cover && (
                <Switch label="לצרף את תמונת המסיבה" checked={withCover} onChange={(e) => setWithCover(e.currentTarget.checked)} />
              )}
            </Group>

            <div>
              <Group justify="space-between" mb={6}>
                <Text fz="sm" fw={500}>
                  קבוצות
                </Text>
                <Group gap={6}>
                  {party && (
                    <Button size="compact-xs" variant="subtle" onClick={() => setGroupIds(recommendedGroups(party, groups))}>
                      רק המתאימות
                    </Button>
                  )}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setGroupIds(groups.filter((g) => g.kind === "group").map((g) => g.id))}
                  >
                    כל הקבוצות
                  </Button>
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setGroupIds([])}>
                    ניקוי
                  </Button>
                </Group>
              </Group>
              <Paper withBorder p="sm" radius="md">
                <ScrollArea.Autosize mah={220}>
                  <Checkbox.Group value={groupIds.map(String)} onChange={(v) => setGroupIds(v.map(Number))}>
                    <Stack gap={6}>
                      {communities.map((c) => (
                        <Stack key={c.id} gap={6}>
                          {groupBox(c)}
                          <Stack gap={6} ps="lg">
                            {groups.filter((g) => g.parentId === c.id).map(groupBox)}
                          </Stack>
                        </Stack>
                      ))}
                      {standalone.map(groupBox)}
                    </Stack>
                  </Checkbox.Group>
                </ScrollArea.Autosize>
              </Paper>
              <Text fz="xs" c="dimmed" mt={4}>
                {groupIds.length} קבוצות · הגעה משוערת: {fmtNumber(reach)} אנשים
              </Text>
            </div>

            <Group align="flex-end">
              <SegmentedControl
                value={mode}
                onChange={(v) => setMode(v as "now" | "later")}
                data={[
                  { value: "now", label: "שליחה עכשיו" },
                  { value: "later", label: "תזמון" },
                ]}
              />
              {mode === "later" && (
                <DateTimePicker
                  style={{ flex: 1 }}
                  placeholder="בחרו תאריך ושעה"
                  value={when}
                  onChange={setWhen}
                  valueFormat="dddd D.M.YYYY · HH:mm"
                  minDate={new Date()}
                />
              )}
            </Group>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Text fz="sm" fw={500} mb={6}>
            תצוגה מקדימה
          </Text>
          <Paper radius="md" className="wa-chat wa-business" p="md" mih={300}>
            <Stack>
              {text.trim() ? (
                <Box className="wa-bubble agent" style={{ maxWidth: "100%" }}>
                  {withCover && party?.cover && <Image src={party.cover.url} radius="sm" mb={6} mah={260} fit="cover" />}
                  <WaText text={previewText} />
                  <div className="wa-time">{mode === "later" && when ? dayjs(when).format("D.M HH:mm") : dayjs().format("HH:mm")} ✓✓</div>
                </Box>
              ) : (
                <Text c="dimmed" fz="sm" ta="center" mt="xl">
                  בחרו מסיבה, או כתבו הודעה.
                </Text>
              )}
            </Stack>
          </Paper>
          {!meta.whatsappLive && (
            <Alert color="blue" variant="light" mt="sm">
              המספר במצב סימולציה: ההודעות נשמרות במערכת ולא יוצאות לוואטסאפ.
            </Alert>
          )}
        </Grid.Col>
      </Grid>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          ביטול
        </Button>
        <Button
          color="green"
          leftSection={<IconSpeakerphone size={16} />}
          onClick={send}
          loading={sending}
          disabled={!text.trim() || groupIds.length === 0 || (mode === "later" && !when)}
        >
          {mode === "later" ? `תזמון ל-${groupIds.length} קבוצות` : `שליחה ל-${groupIds.length} קבוצות`}
        </Button>
      </Group>
    </Modal>
  );
}
