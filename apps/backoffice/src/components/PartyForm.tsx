import {
  ActionIcon,
  Button,
  Grid,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useMeta } from "../App";
import { api, type Category, type Media, type Party, type PartyInput, type TicketTier } from "../api";
import { isoToPicker, partyStatusLabel, pickerToIso } from "../labels";
import { MediaPicker } from "./MediaPicker";

export interface PartyFormValues extends Omit<PartyInput, "coverMediaId"> {
  cover: Media | null;
}

export const emptyParty: PartyFormValues = {
  name: "",
  status: "draft",
  startsAt: null,
  endsAt: null,
  venueName: null,
  address: null,
  city: null,
  region: null,
  description: null,
  lineup: null,
  agentNotes: null,
  minAge: 18,
  ticketUrl: null,
  ticketTiers: [],
  cover: null,
  categoryIds: [],
};

export function partyToValues(p: Party): PartyFormValues {
  return {
    name: p.name,
    status: p.status,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    venueName: p.venueName,
    address: p.address,
    city: p.city,
    region: p.region,
    description: p.description,
    lineup: p.lineup,
    agentNotes: p.agentNotes,
    minAge: p.minAge,
    ticketUrl: p.ticketUrl,
    ticketTiers: p.ticketTiers,
    cover: p.cover,
    categoryIds: p.categories.map((c) => c.id),
  };
}

export function valuesToInput(v: PartyFormValues): PartyInput {
  const { cover, ...rest } = v;
  const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return {
    ...rest,
    venueName: blank(v.venueName),
    address: blank(v.address),
    city: blank(v.city),
    description: blank(v.description),
    lineup: blank(v.lineup),
    agentNotes: blank(v.agentNotes),
    ticketUrl: blank(v.ticketUrl),
    ticketTiers: v.ticketTiers.filter((t) => t.name.trim()),
    coverMediaId: cover?.id ?? null,
  };
}

interface Props {
  values: PartyFormValues;
  onChange: (v: PartyFormValues) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  extraActions?: React.ReactNode;
}

export function PartyForm({ values: v, onChange, onSubmit, submitting, submitLabel, extraActions }: Props) {
  const { meta } = useMeta();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api.get<Category[]>("/api/categories").then(setCategories).catch(() => {});
  }, []);

  const set = <K extends keyof PartyFormValues>(key: K, value: PartyFormValues[K]) => onChange({ ...v, [key]: value });
  const setTier = (i: number, patch: Partial<TicketTier>) =>
    set(
      "ticketTiers",
      v.ticketTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="sm">
                פרטי המסיבה
              </Title>
              <Stack>
                <TextInput label="שם המסיבה" required value={v.name} onChange={(e) => set("name", e.currentTarget.value)} />
                <Group grow align="flex-start">
                  <DateTimePicker
                    label="מתחילה"
                    value={isoToPicker(v.startsAt)}
                    onChange={(val) => set("startsAt", pickerToIso(val))}
                    valueFormat="dddd D.M.YYYY · HH:mm"
                    clearable
                  />
                  <DateTimePicker
                    label="מסתיימת"
                    value={isoToPicker(v.endsAt)}
                    onChange={(val) => set("endsAt", pickerToIso(val))}
                    valueFormat="dddd D.M.YYYY · HH:mm"
                    clearable
                  />
                </Group>
                <MultiSelect
                  label="קטגוריות / סגנון מוזיקה"
                  data={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  value={v.categoryIds.map(String)}
                  onChange={(ids) => set("categoryIds", ids.map(Number))}
                  searchable
                  placeholder="בחרו קטגוריות"
                />
                <TextInput label="ליין-אפ" placeholder="שמות הדיג'ייז, מופרדים בפסיק" value={v.lineup ?? ""} onChange={(e) => set("lineup", e.currentTarget.value)} />
                <Textarea label="תיאור" autosize minRows={3} value={v.description ?? ""} onChange={(e) => set("description", e.currentTarget.value)} />
              </Stack>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="sm">
                מיקום
              </Title>
              <Stack>
                <Group grow align="flex-start">
                  <TextInput label="שם המקום" value={v.venueName ?? ""} onChange={(e) => set("venueName", e.currentTarget.value)} />
                  <TextInput label="עיר" value={v.city ?? ""} onChange={(e) => set("city", e.currentTarget.value)} />
                  <Select label="אזור" data={meta.regions} value={v.region} onChange={(val) => set("region", val)} clearable />
                </Group>
                <TextInput label="כתובת" value={v.address ?? ""} onChange={(e) => set("address", e.currentTarget.value)} />
              </Stack>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="sm">
                כרטיסים
              </Title>
              <Stack>
                <TextInput
                  label="קישור לרכישה (Go-Out)"
                  placeholder="https://go-out.co/event/..."
                  value={v.ticketUrl ?? ""}
                  onChange={(e) => set("ticketUrl", e.currentTarget.value)}
                  description="זה הקישור שסוכן המכירות שולח ללקוחות"
                  dir="ltr"
                />
                <div>
                  <Text fz="sm" fw={500} mb={4}>
                    שלבי מחיר
                  </Text>
                  <Stack gap="xs">
                    {v.ticketTiers.map((t, i) => (
                      <Group key={i} gap="xs" wrap="nowrap">
                        <TextInput style={{ flex: 1 }} placeholder="שם השלב (מוקדמים, רגיל…)" value={t.name} onChange={(e) => setTier(i, { name: e.currentTarget.value })} />
                        <NumberInput w={120} placeholder="מחיר" prefix="₪" min={0} value={t.price} onChange={(val) => setTier(i, { price: Number(val) || 0 })} />
                        <ActionIcon variant="subtle" color="red" onClick={() => set("ticketTiers", v.ticketTiers.filter((_, j) => j !== i))} aria-label="הסרה">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    ))}
                    <Button variant="light" size="xs" w="fit-content" leftSection={<IconPlus size={14} />} onClick={() => set("ticketTiers", [...v.ticketTiers, { name: "", price: 0 }])}>
                      הוספת שלב מחיר
                    </Button>
                  </Stack>
                </div>
                <NumberInput label="גיל מינימלי" w={160} min={0} max={99} value={v.minAge ?? ""} onChange={(val) => set("minAge", val === "" ? null : Number(val))} />
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Select
                label="סטטוס"
                data={meta.partyStatuses.map((s) => ({ value: s, label: partyStatusLabel[s].label }))}
                value={v.status}
                onChange={(val) => val && set("status", val as PartyFormValues["status"])}
                description="רק מסיבות במכירה מוצעות על ידי סוכן המכירות"
              />
            </Paper>
            <Paper withBorder p="md" radius="md">
              <MediaPicker label="תמונת שער" value={v.cover ? [v.cover] : []} onChange={(m) => set("cover", m[0] ?? null)} max={1} accept="image" />
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Textarea
                label="הערות לסוכן המכירות"
                description="מידע שהסוכן ישתמש בו בשיחה: הסעות, קוד לבוש, מה להביא, למי זה מתאים"
                autosize
                minRows={4}
                value={v.agentNotes ?? ""}
                onChange={(e) => set("agentNotes", e.currentTarget.value)}
              />
            </Paper>
            <Group grow>
              {extraActions}
              <Button type="submit" loading={submitting} size="md">
                {submitLabel}
              </Button>
            </Group>
          </Stack>
        </Grid.Col>
      </Grid>
    </form>
  );
}
