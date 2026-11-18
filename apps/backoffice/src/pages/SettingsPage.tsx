import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  ColorSwatch,
  CopyButton,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandInstagram, IconBrandWhatsapp, IconCheck, IconCopy, IconRobot, IconTags, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useMeta } from "../App";
import { api, type Category } from "../api";

type Settings = Record<string, string | boolean>;

const COLORS = ["grape", "violet", "indigo", "blue", "cyan", "teal", "green", "lime", "yellow", "orange", "red", "pink", "dark"];

function CategoriesCard() {
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>("grape");
  const load = () => api.get<Category[]>("/api/categories").then(setCats);
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    try {
      await api.post("/api/categories", { name, color: color ?? "grape" });
      setName("");
      await load();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Group gap={8} mb="sm">
        <IconTags size={20} />
        <Title order={4}>קטגוריות מסיבות</Title>
      </Group>
      <Text fz="sm" c="dimmed" mb="sm">
        סגנונות המוזיקה והאווירה. הסוכן משתמש בהן כדי להתאים מסיבה לטעם של הליד.
      </Text>
      <Group gap={6} mb="md">
        {cats.map((c) => (
          <Badge
            key={c.id}
            color={c.color}
            variant="light"
            size="lg"
            rightSection={
              <ActionIcon
                size="xs"
                variant="transparent"
                color={c.color}
                onClick={async () => {
                  await api.del(`/api/categories/${c.id}`);
                  await load();
                }}
                aria-label="מחיקה"
              >
                <IconTrash size={12} />
              </ActionIcon>
            }
          >
            {c.name}
          </Badge>
        ))}
      </Group>
      <Group gap="xs" align="flex-end">
        <TextInput label="קטגוריה חדשה" value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1 }} />
        <Select
          label="צבע"
          w={130}
          data={COLORS}
          value={color}
          onChange={setColor}
          renderOption={({ option }) => (
            <Group gap={6}>
              <ColorSwatch size={14} color={`var(--mantine-color-${option.value}-6)`} />
              {option.value}
            </Group>
          )}
        />
        <Button onClick={add} disabled={!name.trim()}>
          הוספה
        </Button>
      </Group>
    </Paper>
  );
}

export function SettingsPage() {
  const { meta, refreshMeta } = useMeta();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [igTesting, setIgTesting] = useState(false);
  const [wa, setWa] = useState<Record<string, unknown> | null>(null);
  const [waBusy, setWaBusy] = useState(false);

  useEffect(() => {
    api.get<Settings>("/api/settings").then(setS);
  }, []);

  if (!s) return <Loader />;

  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  const set = (k: string, v: string) => setS({ ...s, [k]: v });

  const save = async (keys: string[]) => {
    setSaving(true);
    try {
      const body = Object.fromEntries(keys.map((k) => [k, str(k)]));
      const next = await api.put<Settings>("/api/settings", body);
      setS({ ...s, ...next });
      await refreshMeta();
      notifications.show({ color: "teal", message: "ההגדרות נשמרו" });
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const testIg = async () => {
    setIgTesting(true);
    try {
      const r = await api.post<{ username: string; userId: string }>("/api/settings/instagram/test");
      notifications.show({ color: "teal", title: "מחובר!", message: `חשבון: @${r.username}` });
      setS({ ...s, ig_user_id: r.userId });
      await refreshMeta();
    } catch (err) {
      notifications.show({ color: "red", title: "החיבור נכשל", message: (err as Error).message });
    } finally {
      setIgTesting(false);
    }
  };

  const checkWa = async () => {
    setWaBusy(true);
    try {
      setWa(await api.get("/api/settings/whatsapp/status"));
    } finally {
      setWaBusy(false);
    }
  };

  const connectWebhook = async () => {
    setWaBusy(true);
    try {
      await api.post("/api/settings/whatsapp/connect-webhook");
      notifications.show({ color: "teal", message: "ה-webhook הוגדר ב-GREEN-API. הודעות נכנסות יגיעו לסוכן." });
      await checkWa();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <Stack maw={980}>
      <Title order={2}>הגדרות</Title>

      <Paper withBorder p="md" radius="md">
        <Group gap={8} mb="sm">
          <IconRobot size={20} />
          <Title order={4}>סוכן המכירות</Title>
          <Badge color={meta.agentConfigured ? "teal" : "orange"} variant="light">
            {meta.agentConfigured ? `פעיל · ${meta.agentModel}` : "חסר ANTHROPIC_API_KEY בשרת"}
          </Badge>
        </Group>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="שם החברה" value={str("company_name")} onChange={(e) => set("company_name", e.currentTarget.value)} />
            <TextInput label="שם הנציג/ה בשיחה" value={str("agent_name")} onChange={(e) => set("agent_name", e.currentTarget.value)} />
            <TextInput
              label="מספר הוואטסאפ של העסק"
              placeholder="972501234567"
              description="לקישורי wa.me בפוסטים"
              value={str("whatsapp_business_number")}
              onChange={(e) => set("whatsapp_business_number", e.currentTarget.value)}
              dir="ltr"
            />
          </SimpleGrid>
          <Textarea
            label="הנחיות נוספות לסוכן"
            description="למשל: טון דיבור, מבצעים כלליים, דברים שאסור להגיד"
            autosize
            minRows={3}
            value={str("agent_extra_instructions")}
            onChange={(e) => set("agent_extra_instructions", e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button loading={saving} onClick={() => save(["company_name", "agent_name", "whatsapp_business_number", "agent_extra_instructions"])}>
              שמירה
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Group gap={8} mb="sm">
          <IconBrandInstagram size={20} />
          <Title order={4}>אינסטגרם</Title>
          <Badge color={meta.instagramLive ? "teal" : "blue"} variant="light">
            {meta.instagramLive ? "מחובר: פרסום אמיתי" : "מצב דמו: פרסום מדומה"}
          </Badge>
        </Group>
        <Text fz="sm" c="dimmed" mb="sm">
          נדרש חשבון Business או Creator, ואפליקציה ב-Meta for Developers עם הרשאת instagram_business_content_publish. מדביקים כאן טוקן גישה ארוך-טווח.
        </Text>
        <Stack>
          <PasswordInput
            label="Access Token"
            placeholder={s.ig_access_token_set ? str("ig_access_token") : "IGAA…"}
            value={str("ig_access_token").includes("••••") ? "" : str("ig_access_token")}
            onChange={(e) => set("ig_access_token", e.currentTarget.value)}
            dir="ltr"
          />
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Instagram User ID" description="מתמלא אוטומטית בבדיקה" value={str("ig_user_id")} onChange={(e) => set("ig_user_id", e.currentTarget.value)} dir="ltr" />
            <TextInput label="Graph host" value={str("ig_graph_host")} onChange={(e) => set("ig_graph_host", e.currentTarget.value)} dir="ltr" />
            <TextInput label="API version" value={str("ig_api_version")} onChange={(e) => set("ig_api_version", e.currentTarget.value)} dir="ltr" />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button variant="default" onClick={testIg} loading={igTesting}>
              בדיקת חיבור
            </Button>
            <Button loading={saving} onClick={() => save(["ig_access_token", "ig_user_id", "ig_graph_host", "ig_api_version"])}>
              שמירה
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Group gap={8} mb="sm">
          <IconBrandWhatsapp size={20} />
          <Title order={4}>וואטסאפ (GREEN-API)</Title>
          <Badge color={meta.greenApiConfigured ? "teal" : "gray"} variant="light">
            {meta.greenApiConfigured ? "מוגדר" : "לא מוגדר"}
          </Badge>
        </Group>
        <Text fz="sm" c="dimmed" mb="sm">
          יוצרים instance ב-console.green-api.com, סורקים QR עם הטלפון של העסק, ומדביקים כאן את הפרטים. אחר כך לוחצים ״חיבור webhook״.
        </Text>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="apiUrl" value={str("greenapi_api_url")} onChange={(e) => set("greenapi_api_url", e.currentTarget.value)} dir="ltr" />
            <TextInput label="idInstance" value={str("greenapi_id_instance")} onChange={(e) => set("greenapi_id_instance", e.currentTarget.value)} dir="ltr" />
            <PasswordInput
              label="apiTokenInstance"
              placeholder={s.greenapi_api_token_set ? str("greenapi_api_token") : ""}
              value={str("greenapi_api_token").includes("••••") ? "" : str("greenapi_api_token")}
              onChange={(e) => set("greenapi_api_token", e.currentTarget.value)}
              dir="ltr"
            />
          </SimpleGrid>
          <Switch
            label="הסוכן עונה אוטומטית להודעות נכנסות"
            checked={str("whatsapp_agent_enabled") === "true"}
            onChange={(e) => set("whatsapp_agent_enabled", e.currentTarget.checked ? "true" : "false")}
          />
          <Group gap={6}>
            <Text fz="xs" c="dimmed">
              כתובת ה-webhook:
            </Text>
            <Code dir="ltr">{str("webhook_url")}</Code>
            <CopyButton value={str("webhook_url")}>
              {({ copied, copy }) => (
                <ActionIcon size="sm" variant="subtle" onClick={copy}>
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
          {wa && (
            <Alert color={wa.error ? "red" : wa.state === "authorized" ? "teal" : "orange"} variant="light">
              {wa.error
                ? String(wa.error)
                : !wa.configured
                  ? "חסרים פרטי GREEN-API"
                  : `מצב: ${String(wa.state)}${wa.phone ? ` · מספר: +${String(wa.phone)}` : ""} · webhook: ${
                      wa.webhookUrl === wa.expectedWebhookUrl ? "מחובר ✓" : "לא מחובר"
                    }`}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={checkWa} loading={waBusy}>
              בדיקת מצב
            </Button>
            <Button variant="light" onClick={connectWebhook} loading={waBusy} disabled={!meta.greenApiConfigured}>
              חיבור webhook
            </Button>
            <Button loading={saving} onClick={() => save(["greenapi_api_url", "greenapi_id_instance", "greenapi_api_token", "whatsapp_agent_enabled"])}>
              שמירה
            </Button>
          </Group>
        </Stack>
      </Paper>

      <CategoriesCard />
    </Stack>
  );
}
