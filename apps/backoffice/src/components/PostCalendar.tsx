import type { EventClickArg, EventContentArg, EventDropArg, EventInput, EventSourceFuncArg } from "@fullcalendar/core";
import heLocale from "@fullcalendar/core/locales/he";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Badge, Button, Group, Paper, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import dayjs from "dayjs";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { api, type Party, type Post } from "../api";
import { postStatusLabel, postTypeLabel } from "../labels";
import { PostEditorModal } from "./PostEditorModal";

interface Props {
  parties: Party[];
  /** When set, the calendar shows and creates posts for this party only. */
  partyId?: number;
  onChanged?: () => void;
  height?: number | "auto";
}

/** "[דוגמה] NATURE TRANCE · יער בירייה" -> "NATURE TRANCE" (calendar cells are narrow). */
const shortName = (name: string) => name.replace(/^\[[^\]]*\]\s*/, "").split(" · ")[0]!.trim();

export interface PostCalendarHandle {
  refetch: () => void;
}

const STATUS_COLORS: Record<Post["status"], { accent: string; bg: string }> = {
  draft: { accent: "var(--mantine-color-gray-5)", bg: "var(--mantine-color-gray-1)" },
  scheduled: { accent: "var(--mantine-color-grape-6)", bg: "var(--mantine-color-grape-0)" },
  publishing: { accent: "var(--mantine-color-blue-6)", bg: "var(--mantine-color-blue-0)" },
  published: { accent: "var(--mantine-color-teal-6)", bg: "var(--mantine-color-teal-0)" },
  failed: { accent: "var(--mantine-color-red-6)", bg: "var(--mantine-color-red-0)" },
};

export const PostCalendar = forwardRef<PostCalendarHandle, Props>(function PostCalendar(
  { parties, partyId, onChanged, height = "auto" },
  ref,
) {
  const calRef = useRef<FullCalendar>(null);
  const [editor, setEditor] = useState<{ post: Post | null; scheduledAt?: string | null } | null>(null);

  const refetch = () => calRef.current?.getApi().refetchEvents();
  useImperativeHandle(ref, () => ({ refetch }));

  const loadEvents = useCallback(async (info: EventSourceFuncArg): Promise<EventInput[]> => {
    const qs = new URLSearchParams({ from: info.start.toISOString(), to: info.end.toISOString() });
    if (partyId) qs.set("partyId", String(partyId));
    const posts = await api.get<Post[]>(`/api/posts?${qs}`);

    const postEvents: EventInput[] = posts
      .filter((p) => p.scheduledAt || p.publishedAt)
      .map((p) => {
        const c = STATUS_COLORS[p.status];
        return {
          id: `post-${p.id}`,
          start: p.publishedAt ?? p.scheduledAt!,
          // Inside a party page the party name is redundant: show the caption instead.
          title: partyId
            ? p.caption.trim().split("\n")[0]!.slice(0, 40) || postTypeLabel[p.type].label
            : p.partyName
              ? shortName(p.partyName)
              : "פוסט כללי",
          classNames: ["post-event"],
          startEditable: p.status === "scheduled" || p.status === "draft" || p.status === "failed",
          durationEditable: false,
          extendedProps: { kind: "post", post: p, accent: c.accent, bg: c.bg },
        };
      });

    const partyEvents: EventInput[] = parties
      .filter((p) => p.startsAt && (!partyId || p.id === partyId))
      .filter((p) => dayjs(p.startsAt).isBefore(info.end) && dayjs(p.startsAt).isAfter(dayjs(info.start).subtract(1, "day")))
      .map((p) => ({
        id: `party-${p.id}`,
        start: dayjs(p.startsAt).format("YYYY-MM-DD"),
        allDay: true,
        title: `🎉 ${shortName(p.name)}`,
        classNames: ["party-event"],
        editable: false,
        extendedProps: { kind: "party", party: p },
      }));

    return [...partyEvents, ...postEvents];
  }, [parties, partyId]);

  const editorDefaults = useMemo(
    () => ({ partyId: partyId ?? null, scheduledAt: editor?.scheduledAt ?? null }),
    [partyId, editor],
  );

  const renderEvent = (arg: EventContentArg) => {
    if (arg.event.extendedProps.kind === "party") {
      return <div style={{ padding: "1px 4px", overflow: "hidden", textOverflow: "ellipsis" }}>{arg.event.title}</div>;
    }
    const post = arg.event.extendedProps.post as Post;
    const thumb = post.media[0];
    return (
      <div
        className="post-event-inner"
        style={{ ["--event-accent" as string]: arg.event.extendedProps.accent }}
        title={`${postTypeLabel[post.type].label} · ${postStatusLabel[post.status].label}${post.error ? ` · ${post.error}` : ""}`}
      >
        {thumb &&
          (thumb.kind === "video" ? <video src={thumb.url} muted /> : <img src={thumb.url} alt="" loading="lazy" />)}
        <span>
          {arg.timeText && <b>{arg.timeText} </b>}
          {postTypeLabel[post.type].icon} {arg.event.title}
          {post.status === "published" ? " ✓" : post.status === "failed" ? " ⚠️" : ""}
        </span>
      </div>
    );
  };

  const onDateClick = (arg: DateClickArg) => {
    const base = dayjs(arg.date);
    const start = arg.allDay ? base.hour(19).minute(0) : base;
    if (start.isBefore(dayjs())) {
      notifications.show({ color: "orange", message: "אי אפשר לתזמן פוסט לזמן שעבר" });
      return;
    }
    setEditor({ post: null, scheduledAt: start.toISOString() });
  };

  const onEventClick = (arg: EventClickArg) => {
    if (arg.event.extendedProps.kind === "post") setEditor({ post: arg.event.extendedProps.post as Post });
  };

  const onEventDrop = async (arg: EventDropArg) => {
    const post = arg.event.extendedProps.post as Post | undefined;
    if (!post || !arg.event.start) return arg.revert();
    let start = dayjs(arg.event.start);
    // Moving in month view keeps the original time of day.
    if (arg.event.allDay || arg.view.type === "dayGridMonth") {
      const orig = dayjs(post.scheduledAt ?? undefined);
      start = start.hour(orig.hour()).minute(orig.minute());
    }
    if (start.isBefore(dayjs())) {
      notifications.show({ color: "orange", message: "אי אפשר להזיז פוסט לזמן שעבר" });
      return arg.revert();
    }
    try {
      await api.patch(`/api/posts/${post.id}/reschedule`, { scheduledAt: start.toISOString() });
      notifications.show({ color: "teal", message: `הפוסט הוזז ל-${start.format("dddd D.M · HH:mm")}` });
      refetch();
      onChanged?.();
    } catch (err) {
      notifications.show({ color: "red", message: (err as Error).message });
      arg.revert();
    }
  };

  return (
    <Paper p="md" withBorder radius="md">
      <Group justify="space-between" mb="sm">
        <Group gap={6}>
          {(["scheduled", "published", "failed", "draft"] as const).map((s) => (
            <Badge key={s} variant="dot" color={postStatusLabel[s].color}>
              {postStatusLabel[s].label}
            </Badge>
          ))}
          <Badge variant="filled" color="dark">
            🎉 ערב המסיבה
          </Badge>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditor({ post: null, scheduledAt: null })}>
          פוסט חדש
        </Button>
      </Group>
      <Text fz="xs" c="dimmed" mb="xs">
        לחיצה על יום יוצרת פוסט חדש · גרירה של פוסט משנה את מועד ההעלאה · לחיצה על פוסט פותחת עריכה
      </Text>

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={heLocale}
        direction="rtl"
        headerToolbar={{ start: "prev,next today", center: "title", end: "dayGridMonth,timeGridWeek,listMonth" }}
        buttonText={{ today: "היום", month: "חודש", week: "שבוע", list: "רשימה" }}
        firstDay={0}
        height={height}
        dayMaxEvents={4}
        nowIndicator
        editable
        eventDurationEditable={false}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        scrollTime="10:00:00"
        events={loadEvents}
        eventContent={renderEvent}
        eventDidMount={(info) => {
          if (info.event.extendedProps.kind === "post") {
            info.el.style.setProperty("--event-accent", info.event.extendedProps.accent);
            info.el.style.setProperty("--event-bg", info.event.extendedProps.bg);
          }
        }}
        dateClick={onDateClick}
        eventClick={onEventClick}
        eventDrop={onEventDrop}
      />

      <PostEditorModal
        opened={editor !== null}
        onClose={() => setEditor(null)}
        onSaved={() => {
          refetch();
          onChanged?.();
        }}
        post={editor?.post ?? null}
        defaults={editorDefaults}
        parties={parties}
        lockParty={Boolean(partyId)}
      />
    </Paper>
  );
});
