import { Badge, Box, Group, Paper, Stack, Text, Timeline } from "@mantine/core";
import {
  IconCalendar,
  IconCash,
  IconLink,
  IconMapPin,
  IconMusic,
  IconNote,
  IconUser,
  IconUserQuestion,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Lead, LeadEvent } from "../api";
import { fmtShort, leadStageLabel } from "../labels";

function Field({ icon, label, value, flash }: { icon: ReactNode; label: string; value: ReactNode; flash: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <Group gap={8} wrap="nowrap" align="flex-start" className={flash ? "field-flash" : undefined} p={4} style={{ borderRadius: 6 }}>
      <Box c={empty ? "gray.4" : "grape.6"} mt={2}>
        {icon}
      </Box>
      <div style={{ minWidth: 0 }}>
        <Text fz={11} c="dimmed" lh={1.1}>
          {label}
        </Text>
        <Text fz="sm" fw={empty ? 400 : 500} c={empty ? "gray.5" : undefined}>
          {empty ? "עוד לא ידוע" : value}
        </Text>
      </div>
    </Group>
  );
}

const EVENT_LABELS: Record<string, string> = {
  lead_created: "ליד חדש נפתח",
  profile_updated: "הסוכן תיעד פרטים",
  link_sent: "נשלח קישור לרכישה",
  handoff: "הועבר לנציג אנושי",
  human_took_over: "נציג ענה מהטלפון",
  bot_paused: "הבוט הושהה",
  bot_resumed: "הבוט חזר לפעול",
  agent_error: "שגיאה בסוכן",
};

function describeEvent(e: LeadEvent) {
  if (e.type === "link_sent") return String(e.data.partyName ?? "");
  if (e.type === "handoff") return String(e.data.reason ?? "");
  if (e.type === "profile_updated") {
    const keys = Object.keys(e.data);
    const he: Record<string, string> = {
      name: "שם",
      region: "אזור",
      city: "עיר",
      genres: "סגנון",
      budget: "תקציב",
      age: "גיל",
      group_size: "כמות",
      preferred_dates: "תאריכים",
      notes: "הערות",
      stage: "שלב",
      interested_party_id: "מסיבה",
    };
    return keys.map((k) => he[k] ?? k).join(", ");
  }
  return "";
}

export function LeadProfileCard({ lead, events }: { lead: Lead; events: LeadEvent[] }) {
  // Highlight fields that changed since the last render (makes the demo visible).
  const prev = useRef<Lead | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (prev.current && prev.current.id === lead.id) {
      const diff = new Set<string>();
      for (const k of Object.keys(lead) as (keyof Lead)[]) {
        if (JSON.stringify(lead[k]) !== JSON.stringify(prev.current[k])) diff.add(k);
      }
      setChanged(diff);
      const t = setTimeout(() => setChanged(new Set()), 2300);
      prev.current = lead;
      return () => clearTimeout(t);
    }
    prev.current = lead;
  }, [lead]);

  const stage = leadStageLabel[lead.stage];
  const timeline = events.filter((e) => e.type !== "profile_updated" || Object.keys(e.data).length > 0).slice(-6);

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>כרטיס ליד</Text>
        <Badge color={stage.color} variant="light" className={changed.has("stage") ? "field-flash" : undefined}>
          {stage.label}
        </Badge>
      </Group>
      <Stack gap={2}>
        <Field icon={<IconUser size={16} />} label="שם" value={lead.name ?? lead.waName} flash={changed.has("name")} />
        <Field icon={<IconMusic size={16} />} label="טעם מוזיקלי" value={lead.genres.join(", ")} flash={changed.has("genres")} />
        <Field
          icon={<IconMapPin size={16} />}
          label="אזור / עיר"
          value={[lead.region, lead.city].filter(Boolean).join(" · ")}
          flash={changed.has("region") || changed.has("city")}
        />
        <Field icon={<IconCash size={16} />} label="תקציב לכרטיס" value={lead.budget ? `עד ₪${lead.budget}` : null} flash={changed.has("budget")} />
        <Field icon={<IconUserQuestion size={16} />} label="גיל" value={lead.age} flash={changed.has("age")} />
        <Field icon={<IconUsersGroup size={16} />} label="כמה מגיעים" value={lead.groupSize} flash={changed.has("groupSize")} />
        <Field icon={<IconCalendar size={16} />} label="תאריכים מועדפים" value={lead.preferredDates} flash={changed.has("preferredDates")} />
        <Field icon={<IconLink size={16} />} label="מסיבה שמעניינת" value={lead.interestedPartyName} flash={changed.has("interestedPartyName")} />
        <Field icon={<IconNote size={16} />} label="הערות לצוות" value={lead.notes} flash={changed.has("notes")} />
      </Stack>

      {timeline.length > 0 && (
        <>
          <Text fw={600} fz="sm" mt="md" mb="xs">
            פעולות הסוכן
          </Text>
          <Timeline bulletSize={14} lineWidth={2} active={timeline.length}>
            {timeline.map((e) => (
              <Timeline.Item
                key={e.id}
                color={e.type === "link_sent" ? "green" : e.type === "handoff" ? "orange" : e.type === "agent_error" ? "red" : "grape"}
                title={<Text fz="xs" fw={600}>{EVENT_LABELS[e.type] ?? e.type}</Text>}
              >
                <Text fz={11} c="dimmed">
                  {describeEvent(e)} {describeEvent(e) ? "· " : ""}
                  {fmtShort(e.createdAt)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </>
      )}
    </Paper>
  );
}
