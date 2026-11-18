import dayjs from "dayjs";
import "dayjs/locale/he";
import type { LeadStage, PartyStatus, PostStatus, PostType } from "./api";

dayjs.locale("he");

export const partyStatusLabel: Record<PartyStatus, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "gray" },
  on_sale: { label: "במכירה", color: "green" },
  sold_out: { label: "סולד אאוט", color: "orange" },
  cancelled: { label: "בוטלה", color: "red" },
};

export const postTypeLabel: Record<PostType, { label: string; icon: string }> = {
  feed: { label: "פוסט", icon: "🖼️" },
  carousel: { label: "קרוסלה", icon: "🎠" },
  reel: { label: "ריל", icon: "🎬" },
  story: { label: "סטורי", icon: "⏱️" },
};

export const postStatusLabel: Record<PostStatus, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "gray" },
  scheduled: { label: "מתוזמן", color: "grape" },
  publishing: { label: "בפרסום…", color: "blue" },
  published: { label: "פורסם", color: "teal" },
  failed: { label: "נכשל", color: "red" },
};

export const leadStageLabel: Record<LeadStage, { label: string; color: string }> = {
  new: { label: "חדש", color: "gray" },
  qualifying: { label: "בבירור", color: "blue" },
  pitched: { label: "קיבל הצעה", color: "violet" },
  link_sent: { label: "קיבל קישור", color: "green" },
  needs_human: { label: "ממתין לנציג", color: "orange" },
  not_interested: { label: "לא מעוניין", color: "red" },
};

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? dayjs(iso).format("dddd, D.M.YY · HH:mm") : "—";

export const fmtShort = (iso: string | null | undefined) => (iso ? dayjs(iso).format("D.M · HH:mm") : "—");

export const fmtRelative = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = dayjs(iso);
  const mins = dayjs().diff(d, "minute");
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  return d.format("D.M.YY");
};

/** Turns a local "YYYY-MM-DD HH:mm:ss" value from Mantine pickers into ISO (UTC). */
export const pickerToIso = (v: string | null) => (v ? dayjs(v).toISOString() : null);
/** ISO -> local "YYYY-MM-DD HH:mm:ss" for Mantine pickers. */
export const isoToPicker = (iso: string | null) => (iso ? dayjs(iso).format("YYYY-MM-DD HH:mm:ss") : null);

/** "972501234567" -> "+972 50-123-4567" */
export const fmtPhone = (digits: string | null | undefined) => {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  return d.startsWith("972") && d.length === 12 ? `+972 ${d.slice(3, 5)}-${d.slice(5, 8)}-${d.slice(8)}` : `+${d}`;
};

export const fmtNumber = (n: number) => n.toLocaleString("he-IL");
