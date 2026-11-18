import { Badge, Button, Grid, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, ThemeIcon, Title } from "@mantine/core";
import {
  IconAlertTriangle,
  IconBrandInstagram,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconConfetti,
  IconLink,
  IconUserExclamation,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMeta } from "../App";
import { api, type Party, type Post } from "../api";
import { fmtDateTime, fmtShort, postTypeLabel } from "../labels";

interface Dashboard {
  upcomingParties: number;
  scheduledPosts: number;
  publishedThisWeek: number;
  failedPosts: number;
  whatsappLeads: number;
  linksSent: number;
  needsHuman: number;
  nextPosts: Post[];
  upcoming: Party[];
}

function Stat({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between">
        <div>
          <Text fz="xs" c="dimmed" fw={500}>
            {label}
          </Text>
          <Text fz={28} fw={800} lh={1.2}>
            {value}
          </Text>
        </div>
        <ThemeIcon size={44} radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { meta } = useMeta();
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => {
    api.get<Dashboard>("/api/dashboard").then(setD);
  }, []);

  if (!d) return <Loader />;

  return (
    <Stack>
      <div>
        <Title order={2}>שלום 👋</Title>
        <Text c="dimmed">תמונת מצב של המסיבות, הפרסומים והלידים של {meta.companyName}</Text>
      </div>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat label="מסיבות קרובות" value={d.upcomingParties} icon={<IconConfetti size={24} />} color="grape" />
        <Stat label="פוסטים מתוזמנים" value={d.scheduledPosts} icon={<IconCalendarEvent size={24} />} color="violet" />
        <Stat label="לידים מוואטסאפ" value={d.whatsappLeads} icon={<IconBrandWhatsapp size={24} />} color="green" />
        <Stat label="קישורי רכישה שנשלחו" value={d.linksSent} icon={<IconLink size={24} />} color="teal" />
      </SimpleGrid>

      {(d.failedPosts > 0 || d.needsHuman > 0) && (
        <Group>
          {d.failedPosts > 0 && (
            <Button variant="light" color="red" leftSection={<IconAlertTriangle size={16} />} onClick={() => navigate("/calendar")}>
              {d.failedPosts} פוסטים נכשלו בפרסום
            </Button>
          )}
          {d.needsHuman > 0 && (
            <Button variant="light" color="orange" leftSection={<IconUserExclamation size={16} />} onClick={() => navigate("/leads")}>
              {d.needsHuman} לידים מחכים לנציג
            </Button>
          )}
        </Group>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm">
              <Group gap={6}>
                <IconBrandInstagram size={18} />
                <Text fw={700}>הפוסטים הבאים לאינסטגרם</Text>
              </Group>
              <Button variant="subtle" size="xs" onClick={() => navigate("/calendar")}>
                ללוח המלא
              </Button>
            </Group>
            {d.nextPosts.length === 0 ? (
              <Text c="dimmed" fz="sm">
                אין פוסטים מתוזמנים.
              </Text>
            ) : (
              <Table verticalSpacing={6}>
                <Table.Tbody>
                  {d.nextPosts.map((p) => (
                    <Table.Tr key={p.id} style={{ cursor: p.partyId ? "pointer" : undefined }} onClick={() => p.partyId && navigate(`/parties/${p.partyId}`)}>
                      <Table.Td w={110}>
                        <Text fz="sm" fw={600}>
                          {fmtShort(p.scheduledAt)}
                        </Text>
                      </Table.Td>
                      <Table.Td w={90}>
                        <Badge variant="light" size="sm">
                          {postTypeLabel[p.type].icon} {postTypeLabel[p.type].label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="sm" lineClamp={1}>
                          {p.partyName ?? "פוסט כללי"}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm">
              <Text fw={700}>המסיבות הקרובות</Text>
              <Button variant="subtle" size="xs" onClick={() => navigate("/parties")}>
                לכל המסיבות
              </Button>
            </Group>
            <Stack gap="xs">
              {d.upcoming.map((p) => (
                <Paper key={p.id} p="xs" radius="sm" bg="gray.0" style={{ cursor: "pointer" }} onClick={() => navigate(`/parties/${p.id}`)}>
                  <Text fz="sm" fw={600} lineClamp={1}>
                    {p.name}
                  </Text>
                  <Text fz="xs" c="dimmed">
                    {fmtDateTime(p.startsAt)} · {p.scheduledPosts} פוסטים מתוזמנים
                  </Text>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
