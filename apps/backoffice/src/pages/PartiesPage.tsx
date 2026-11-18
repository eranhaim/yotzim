import { Badge, Box, Button, Card, Group, Image, Loader, SegmentedControl, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconCalendarEvent, IconMapPin, IconPlus } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Party } from "../api";
import { fmtDateTime, partyStatusLabel } from "../labels";

export function PartyCover({ party, h = 160 }: { party: Party; h?: number }) {
  return party.cover ? (
    <Image src={party.cover.url} h={h} fit="cover" alt="" />
  ) : (
    <Box h={h} className="cover-fallback" />
  );
}

export function PartiesPage() {
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[] | null>(null);
  const [filter, setFilter] = useState("upcoming");

  useEffect(() => {
    api.get<Party[]>("/api/parties").then(setParties);
  }, []);

  const shown = (parties ?? []).filter((p) => {
    const past = p.startsAt && dayjs(p.startsAt).isBefore(dayjs().subtract(12, "hour"));
    return filter === "all" ? true : filter === "past" ? past : !past;
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>מסיבות</Title>
        <Group>
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            data={[
              { value: "upcoming", label: "קרובות" },
              { value: "past", label: "עברו" },
              { value: "all", label: "הכל" },
            ]}
          />
          <Button leftSection={<IconPlus size={16} />} onClick={() => navigate("/parties/new")}>
            מסיבה חדשה
          </Button>
        </Group>
      </Group>

      {!parties ? (
        <Loader />
      ) : shown.length === 0 ? (
        <Text c="dimmed">אין מסיבות להצגה.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {shown.map((p) => (
            <Card key={p.id} withBorder radius="md" padding="md" style={{ cursor: "pointer" }} onClick={() => navigate(`/parties/${p.id}`)}>
              <Card.Section>
                <PartyCover party={p} />
              </Card.Section>
              <Group justify="space-between" mt="sm" wrap="nowrap" align="flex-start">
                <Text fw={700} lineClamp={2}>
                  {p.name}
                </Text>
                <Badge color={partyStatusLabel[p.status].color} variant="light" style={{ flex: "none" }}>
                  {partyStatusLabel[p.status].label}
                </Badge>
              </Group>
              <Stack gap={4} mt={6}>
                <Group gap={6} c="dimmed">
                  <IconCalendarEvent size={14} />
                  <Text fz="sm">{fmtDateTime(p.startsAt)}</Text>
                </Group>
                <Group gap={6} c="dimmed">
                  <IconMapPin size={14} />
                  <Text fz="sm">{[p.venueName, p.city].filter(Boolean).join(", ") || "—"}</Text>
                </Group>
              </Stack>
              <Group gap={4} mt="sm">
                {p.categories.map((c) => (
                  <Badge key={c.id} color={c.color} variant="dot" size="sm">
                    {c.name}
                  </Badge>
                ))}
              </Group>
              <Group justify="space-between" mt="sm">
                <Text fz="sm" fw={600}>
                  {p.minPrice ? `החל מ-₪${p.minPrice}` : "מחיר לא הוגדר"}
                </Text>
                <Text fz="xs" c="dimmed">
                  {p.scheduledPosts} פוסטים מתוזמנים · {p.publishedPosts} פורסמו
                </Text>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
