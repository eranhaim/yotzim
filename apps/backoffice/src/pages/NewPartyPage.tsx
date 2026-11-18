import { Alert, Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type GoOutImport, type Party } from "../api";
import { emptyParty, PartyForm, valuesToInput, type PartyFormValues } from "../components/PartyForm";

export function NewPartyPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<PartyFormValues>(emptyParty);
  const [saving, setSaving] = useState(false);
  const [goOutUrl, setGoOutUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const runImport = async () => {
    setImporting(true);
    try {
      const r = await api.post<GoOutImport>("/api/parties/import-goout", { url: goOutUrl });
      setValues((v) => ({
        ...v,
        name: r.name || v.name,
        description: r.description ?? v.description,
        startsAt: r.startsAt ?? v.startsAt,
        endsAt: r.endsAt ?? v.endsAt,
        venueName: r.venueName ?? v.venueName,
        address: r.address ?? v.address,
        city: r.city ?? v.city,
        region: r.region ?? v.region,
        ticketUrl: r.ticketUrl,
        ticketTiers: r.ticketTiers.length ? r.ticketTiers : v.ticketTiers,
        cover: r.cover ?? v.cover,
        status: "on_sale",
      }));
      setImported(true);
      notifications.show({ color: "teal", message: "הפרטים יובאו מ-Go-Out. בדקו, הוסיפו קטגוריות ושמרו." });
    } catch (err) {
      notifications.show({ color: "red", title: "הייבוא נכשל", message: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const p = await api.post<Party>("/api/parties", valuesToInput(values));
      notifications.show({ color: "teal", message: "המסיבה נשמרה" });
      navigate(`/parties/${p.id}`);
    } catch (err) {
      notifications.show({ color: "red", title: "לא נשמר", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Title order={2}>מסיבה חדשה</Title>
      <Paper withBorder p="md" radius="md" bg="grape.0">
        <Text fw={600} mb={4}>
          ייבוא מהיר מ-Go-Out
        </Text>
        <Text fz="sm" c="dimmed" mb="sm">
          הדביקו קישור לאירוע ב-Go-Out והמערכת תמלא שם, תאריכים, מיקום, מחירים ותמונה.
        </Text>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            placeholder="https://go-out.co/event/..."
            value={goOutUrl}
            onChange={(e) => setGoOutUrl(e.currentTarget.value)}
            dir="ltr"
          />
          <Button leftSection={<IconDownload size={16} />} onClick={runImport} loading={importing} disabled={!goOutUrl.trim()}>
            ייבוא
          </Button>
        </Group>
        {imported && (
          <Alert mt="sm" color="teal" variant="light">
            יובא בהצלחה. הוסיפו קטגוריות והערות לסוכן, ושמרו.
          </Alert>
        )}
      </Paper>
      <PartyForm values={values} onChange={setValues} onSubmit={save} submitting={saving} submitLabel="שמירת המסיבה" />
    </Stack>
  );
}
