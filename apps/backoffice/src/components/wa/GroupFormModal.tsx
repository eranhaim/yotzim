import { Button, Group, Modal, MultiSelect, NumberInput, SegmentedControl, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useMeta } from "../../App";
import { api, type Category, type WaGroup, type WaGroupInput } from "../../api";

const EMPTY: WaGroupInput = {
  name: "",
  kind: "group",
  parentId: null,
  chatId: null,
  members: 0,
  region: null,
  description: null,
  categoryIds: [],
};

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: (group: WaGroup) => void;
  group: WaGroup | null;
  groups: WaGroup[];
}

export function GroupFormModal({ opened, onClose, onSaved, group, groups }: Props) {
  const { meta } = useMeta();
  const [values, setValues] = useState<WaGroupInput>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    void api.get<Category[]>("/api/categories").then(setCategories);
    setValues(
      group
        ? {
            name: group.name,
            kind: group.kind,
            parentId: group.parentId,
            chatId: group.chatId,
            members: group.members,
            region: group.region,
            description: group.description,
            categoryIds: group.categoryIds,
          }
        : EMPTY,
    );
  }, [opened, group]);

  const set = <K extends keyof WaGroupInput>(key: K, value: WaGroupInput[K]) => setValues((v) => ({ ...v, [key]: value }));
  const communities = groups.filter((g) => g.kind === "community" && g.id !== group?.id);

  const save = async () => {
    setSaving(true);
    try {
      const saved = group
        ? await api.put<WaGroup>(`/api/whatsapp/groups/${group.id}`, values)
        : await api.post<WaGroup>("/api/whatsapp/groups", values);
      notifications.show({ color: "teal", message: group ? "הקבוצה עודכנה" : "הקבוצה חוברה למספר" });
      onSaved(saved);
      onClose();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={group ? "עריכת קבוצה" : "חיבור קבוצה למספר"} size="lg">
      <Stack>
        <SegmentedControl
          value={values.kind}
          onChange={(v) => set("kind", v as WaGroupInput["kind"])}
          data={[
            { value: "group", label: "קבוצה" },
            { value: "community", label: "קהילה (כמה קבוצות)" },
          ]}
        />
        <TextInput label="שם" required value={values.name} onChange={(e) => set("name", e.currentTarget.value)} data-autofocus />
        <Group grow align="flex-start">
          {values.kind === "group" && (
            <Select
              label="בתוך קהילה"
              placeholder="ללא"
              clearable
              data={communities.map((c) => ({ value: String(c.id), label: c.name }))}
              value={values.parentId ? String(values.parentId) : null}
              onChange={(v) => set("parentId", v ? Number(v) : null)}
            />
          )}
          <NumberInput
            label={values.kind === "community" ? "חברים (אם אין קבוצות מפורטות)" : "מספר חברים"}
            min={0}
            max={100000}
            thousandSeparator=","
            value={values.members}
            onChange={(v) => set("members", Number(v) || 0)}
          />
        </Group>
        <Group grow align="flex-start">
          <Select
            label="אזור"
            placeholder="כל הארץ"
            clearable
            data={meta.regions}
            value={values.region}
            onChange={(v) => set("region", v)}
          />
          <MultiSelect
            label="סגנונות מוזיקה"
            placeholder="כל הסגנונות"
            data={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            value={values.categoryIds.map(String)}
            onChange={(v) => set("categoryIds", v.map(Number))}
          />
        </Group>
        <Textarea
          label="על הקבוצה"
          description="הסוכן מקבל את התיאור כשליד מגיע מהקבוצה"
          autosize
          minRows={2}
          value={values.description ?? ""}
          onChange={(e) => set("description", e.currentTarget.value || null)}
        />
        <TextInput
          label="מזהה הקבוצה בוואטסאפ"
          description="נדרש רק לחיבור אמיתי דרך GREEN-API. במצב סימולציה אפשר להשאיר ריק."
          placeholder="120363000000000000@g.us"
          dir="ltr"
          value={values.chatId ?? ""}
          onChange={(e) => set("chatId", e.currentTarget.value || null)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            ביטול
          </Button>
          <Button color="green" onClick={save} loading={saving} disabled={!values.name.trim()}>
            שמירה
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
