import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconBrandInstagram, IconExternalLink, IconSend } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { api, type Media, type Party, type Post, type PostInput, type PostType } from "../api";
import { fmtDateTime, isoToPicker, pickerToIso, postStatusLabel, postTypeLabel } from "../labels";
import { MediaPicker, MediaThumb } from "./MediaPicker";

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  post: Post | null;
  defaults?: { partyId?: number | null; scheduledAt?: string | null };
  parties: Party[];
  lockParty?: boolean;
}

const RULES: Record<PostType, { max: number; accept: "image" | "video" | "both"; hint: string }> = {
  feed: { max: 1, accept: "image", hint: "תמונה אחת. יחס מומלץ 4:5 (1080×1350)." },
  carousel: { max: 10, accept: "both", hint: "2 עד 10 תמונות או סרטונים, לפי הסדר." },
  reel: { max: 1, accept: "video", hint: "וידאו אנכי אחד (9:16), MP4, עד 15 דקות." },
  story: { max: 1, accept: "both", hint: "תמונה או וידאו אנכי (9:16). בסטורי אין כיתוב." },
};

export function PostEditorModal({ opened, onClose, onSaved, post, defaults, parties, lockParty }: Props) {
  const [type, setType] = useState<PostType>("feed");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [when, setWhen] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "scheduled" | "now">(null);

  const readOnly = post?.status === "published" || post?.status === "publishing";

  useEffect(() => {
    if (!opened) return;
    setType(post?.type ?? "feed");
    setPartyId(post?.partyId ? String(post.partyId) : defaults?.partyId ? String(defaults.partyId) : null);
    setCaption(post?.caption ?? "");
    setMedia(post?.media ?? []);
    setWhen(isoToPicker(post?.scheduledAt ?? defaults?.scheduledAt ?? null));
  }, [opened, post, defaults]);

  const rules = RULES[type];
  const selectedParty = parties.find((p) => String(p.id) === partyId);

  const changeType = (t: PostType) => {
    setType(t);
    const r = RULES[t];
    setMedia((m) =>
      m.filter((x) => r.accept === "both" || x.kind === r.accept).slice(0, r.max),
    );
  };

  const input = (status: "draft" | "scheduled"): PostInput => ({
    partyId: partyId ? Number(partyId) : null,
    type,
    caption: type === "story" ? "" : caption,
    mediaIds: media.map((m) => m.id),
    scheduledAt: pickerToIso(when),
    status,
  });

  const save = async (status: "draft" | "scheduled") => {
    setSaving(status);
    try {
      if (post) await api.put<Post>(`/api/posts/${post.id}`, input(status));
      else await api.post<Post>("/api/posts", input(status));
      notifications.show({
        color: "teal",
        message: status === "scheduled" ? `הפוסט תוזמן ל-${fmtDateTime(pickerToIso(when))}` : "נשמר כטיוטה",
      });
      onSaved();
      onClose();
    } catch (err) {
      notifications.show({ color: "red", title: "לא נשמר", message: (err as Error).message });
    } finally {
      setSaving(null);
    }
  };

  const publishNow = async () => {
    setSaving("now");
    try {
      let id = post?.id;
      const body = { ...input("draft"), scheduledAt: new Date().toISOString() };
      if (id) await api.put(`/api/posts/${id}`, body);
      else id = (await api.post<Post>("/api/posts", body)).id;
      const result = await api.post<Post>(`/api/posts/${id}/publish-now`);
      if (result.status === "published") {
        notifications.show({
          color: "teal",
          title: "פורסם!",
          message: result.simulated ? "פרסום מדומה (אינסטגרם במצב דמו)" : "הפוסט עלה לאינסטגרם",
        });
      } else {
        notifications.show({ color: "red", title: "הפרסום נכשל", message: result.error ?? "" });
      }
      onSaved();
      onClose();
    } catch (err) {
      notifications.show({ color: "red", title: "הפרסום נכשל", message: (err as Error).message });
    } finally {
      setSaving(null);
    }
  };

  const remove = () => {
    if (!post) return;
    modals.openConfirmModal({
      title: "מחיקת פוסט",
      children: <Text fz="sm">למחוק את הפוסט מהלוח? הפעולה לא מוחקת פוסט שכבר עלה לאינסטגרם.</Text>,
      labels: { confirm: "מחיקה", cancel: "ביטול" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await api.del(`/api/posts/${post.id}`);
        onSaved();
        onClose();
      },
    });
  };

  const partyOptions = useMemo(
    () => parties.map((p) => ({ value: String(p.id), label: p.name })),
    [parties],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={
        <Group gap="xs">
          <IconBrandInstagram size={20} />
          <Text fw={700}>{post ? "עריכת פוסט" : "פוסט חדש לאינסטגרם"}</Text>
          {post && (
            <Badge color={postStatusLabel[post.status].color} variant="light">
              {postStatusLabel[post.status].label}
            </Badge>
          )}
        </Group>
      }
    >
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack>
            {post?.status === "failed" && post.error && (
              <Alert color="red" icon={<IconAlertTriangle size={18} />} title="הפרסום הקודם נכשל">
                {post.error}
              </Alert>
            )}
            {post?.status === "published" && (
              <Alert color="teal" title="הפוסט פורסם">
                {fmtDateTime(post.publishedAt)}
                {post.simulated && " · פרסום מדומה (מצב דמו)"}
                {post.permalink && (
                  <Anchor href={post.permalink} target="_blank" ms="xs">
                    צפייה באינסטגרם <IconExternalLink size={12} />
                  </Anchor>
                )}
              </Alert>
            )}

            <SegmentedControl
              fullWidth
              value={type}
              onChange={(v) => changeType(v as PostType)}
              disabled={readOnly}
              data={(Object.keys(postTypeLabel) as PostType[]).map((t) => ({
                value: t,
                label: `${postTypeLabel[t].icon} ${postTypeLabel[t].label}`,
              }))}
            />

            <Select
              label="מסיבה"
              placeholder="פוסט כללי (ללא מסיבה)"
              data={partyOptions}
              value={partyId}
              onChange={setPartyId}
              searchable
              clearable
              disabled={readOnly || lockParty}
            />

            <div>
              <MediaPicker
                label="מדיה"
                value={media}
                onChange={setMedia}
                max={rules.max}
                accept={rules.accept}
              />
              <Text fz="xs" c="dimmed" mt={4}>
                {rules.hint}
              </Text>
            </div>

            {type !== "story" && (
              <Textarea
                label="כיתוב"
                placeholder="מה כותבים בפוסט? אפשר אימוג'ים והאשטגים"
                autosize
                minRows={4}
                maxRows={10}
                value={caption}
                onChange={(e) => setCaption(e.currentTarget.value)}
                disabled={readOnly}
                description={`${caption.length} / 2,200 תווים`}
                error={caption.length > 2200 ? "ארוך מדי" : undefined}
              />
            )}

            <DateTimePicker
              label="מועד העלאה"
              placeholder="בחרו תאריך ושעה"
              value={when}
              onChange={setWhen}
              valueFormat="dddd D.M.YYYY · HH:mm"
              disabled={readOnly}
              clearable
              minDate={new Date()}
            />
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Text fz="sm" fw={500} mb={6}>
            תצוגה מקדימה
          </Text>
          <Box className="phone-preview">
            <Group gap={8} p={8}>
              <Box w={28} h={28} className="cover-fallback" style={{ borderRadius: "50%" }} />
              <Text fz="sm" fw={600}>
                yotzim
              </Text>
            </Group>
            {media[0] ? (
              <Box style={{ aspectRatio: type === "story" || type === "reel" ? "9 / 16" : "4 / 5", maxHeight: 420 }}>
                <MediaThumb media={media[0]} h={type === "story" || type === "reel" ? 420 : 340} />
              </Box>
            ) : (
              <Box className="cover-fallback" h={300} />
            )}
            {type === "carousel" && media.length > 1 && (
              <Text fz="xs" ta="center" c="dimmed" mt={4}>
                {"● ".repeat(media.length).trim()}
              </Text>
            )}
            {type !== "story" && (
              <Text fz="sm" p={10} style={{ whiteSpace: "pre-wrap" }} lineClamp={6}>
                <b>yotzim</b> {caption || <Text span c="dimmed">הכיתוב יופיע כאן</Text>}
              </Text>
            )}
          </Box>
          {selectedParty && (
            <Text fz="xs" c="dimmed" mt="xs">
              המסיבה: {selectedParty.name} · {fmtDateTime(selectedParty.startsAt)}
            </Text>
          )}
        </Grid.Col>
      </Grid>

      {!readOnly && (
        <Group justify="space-between" mt="xl">
          <Group>
            {post && (
              <Button variant="subtle" color="red" onClick={remove}>
                מחיקה
              </Button>
            )}
          </Group>
          <Group>
            <Button variant="default" loading={saving === "draft"} onClick={() => save("draft")}>
              שמירה כטיוטה
            </Button>
            <Button variant="light" leftSection={<IconSend size={16} />} loading={saving === "now"} onClick={publishNow}>
              פרסום עכשיו
            </Button>
            <Button loading={saving === "scheduled"} onClick={() => save("scheduled")} disabled={!when}>
              תזמון העלאה
            </Button>
          </Group>
        </Group>
      )}
    </Modal>
  );
}
