import { getClient } from "../agent/agent.js";
import { config } from "../config.js";
import { db, nowIso, parseJson } from "../db.js";
import { getMedia, publicMediaUrl, toMediaDto } from "../media.js";
import { getParty, type PartyDto } from "../parties.js";
import { getSetting } from "../settings.js";
import { sendFileByUrl, sendText } from "./greenapi.js";
import { entryLink, whatsappLive } from "./transport.js";

/** In an announcement text, this token becomes the personal-chat link of each group. */
export const LINK_TOKEN = "{{קישור}}";

/* ---------------- groups ---------------- */

export interface WaGroupRow {
  id: number;
  name: string;
  kind: "group" | "community";
  parent_id: number | null;
  chat_id: string | null;
  members: number;
  region: string | null;
  description: string | null;
  category_ids: string;
  created_at: string;
  updated_at: string;
}

export interface WaGroupInput {
  name: string;
  kind: "group" | "community";
  parentId: number | null;
  chatId: string | null;
  members: number;
  region: string | null;
  description: string | null;
  categoryIds: number[];
}

const groupStmt = db.prepare<[number], WaGroupRow>("SELECT * FROM wa_groups WHERE id = ?");
const lastMessageStmt = db.prepare<[number], { text: string; at: string }>(
  `SELECT text, COALESCE(sent_at, scheduled_at, created_at) AS at FROM wa_group_messages
   WHERE group_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1`,
);
const groupStatsStmt = db.prepare<[number, number, number], { sent: number; scheduled: number; leads: number }>(
  `SELECT
     (SELECT COUNT(*) FROM wa_group_messages WHERE group_id = ? AND status = 'sent') AS sent,
     (SELECT COUNT(*) FROM wa_group_messages WHERE group_id = ? AND status = 'scheduled') AS scheduled,
     (SELECT COUNT(*) FROM leads WHERE source_group_id = ?) AS leads`,
);

export function getGroupRow(id: number) {
  return groupStmt.get(id);
}

function toGroupDto(row: WaGroupRow, all: WaGroupRow[]) {
  const children = all.filter((g) => g.parent_id === row.id);
  const stats = groupStatsStmt.get(row.id, row.id, row.id)!;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parent_id,
    parentName: row.parent_id ? (all.find((g) => g.id === row.parent_id)?.name ?? null) : null,
    chatId: row.chat_id,
    /** A community reaches everyone in its groups. */
    members: row.kind === "community" ? Math.max(row.members, children.reduce((s, c) => s + c.members, 0)) : row.members,
    groupCount: children.length,
    region: row.region,
    description: row.description,
    categoryIds: parseJson<number[]>(row.category_ids, []),
    lastMessage: lastMessageStmt.get(row.id) ?? null,
    sentCount: stats.sent,
    scheduledCount: stats.scheduled,
    leadsCount: stats.leads,
  };
}
export type WaGroupDto = ReturnType<typeof toGroupDto>;

export function listGroups() {
  const all = db.prepare<[], WaGroupRow>("SELECT * FROM wa_groups ORDER BY kind = 'community' DESC, id").all();
  return all.map((g) => toGroupDto(g, all));
}

export function getGroup(id: number) {
  return listGroups().find((g) => g.id === id) ?? null;
}

export function createGroup(input: WaGroupInput) {
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO wa_groups (name, kind, parent_id, chat_id, members, region, description, category_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.kind,
      input.kind === "group" ? input.parentId : null,
      input.chatId,
      input.members,
      input.region,
      input.description,
      JSON.stringify(input.categoryIds),
      now,
      now,
    );
  return Number(info.lastInsertRowid);
}

export function updateGroup(id: number, input: WaGroupInput) {
  db.prepare(
    `UPDATE wa_groups SET name=?, kind=?, parent_id=?, chat_id=?, members=?, region=?, description=?, category_ids=?, updated_at=?
     WHERE id=?`,
  ).run(
    input.name,
    input.kind,
    input.kind === "group" && input.parentId !== id ? input.parentId : null,
    input.chatId,
    input.members,
    input.region,
    input.description,
    JSON.stringify(input.categoryIds),
    nowIso(),
    id,
  );
}

export function deleteGroup(id: number) {
  db.prepare("DELETE FROM wa_groups WHERE id = ?").run(id);
}

/* ---------------- group messages ---------------- */

interface GroupMessageRow {
  id: number;
  group_id: number;
  party_id: number | null;
  text: string;
  media_id: string | null;
  status: "scheduled" | "sending" | "sent" | "failed";
  scheduled_at: string | null;
  sent_at: string | null;
  error: string | null;
  simulated: number;
  created_at: string;
}

const partyNameStmt = db.prepare<[number], { name: string }>("SELECT name FROM parties WHERE id = ?");
const messageLeadsStmt = db.prepare<[number, number], { n: number }>(
  "SELECT COUNT(*) AS n FROM leads WHERE source_group_id = ? AND source_party_id = ?",
);

function toMessageDto(row: GroupMessageRow) {
  const media = row.media_id ? getMedia(row.media_id) : undefined;
  return {
    id: row.id,
    groupId: row.group_id,
    partyId: row.party_id,
    partyName: row.party_id ? (partyNameStmt.get(row.party_id)?.name ?? null) : null,
    text: row.text,
    media: media ? toMediaDto(media) : null,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    error: row.error,
    simulated: Boolean(row.simulated),
    createdAt: row.created_at,
    /** Leads who opened a private chat from this group about this party. */
    leads: row.party_id ? messageLeadsStmt.get(row.group_id, row.party_id)!.n : 0,
  };
}
export type GroupMessageDto = ReturnType<typeof toMessageDto>;

export function listGroupMessages(groupId: number) {
  return db
    .prepare<[number], GroupMessageRow>(
      "SELECT * FROM wa_group_messages WHERE group_id = ? ORDER BY COALESCE(sent_at, scheduled_at, created_at), id",
    )
    .all(groupId)
    .map(toMessageDto);
}

export function getGroupMessage(id: number) {
  const row = db.prepare<[number], GroupMessageRow>("SELECT * FROM wa_group_messages WHERE id = ?").get(id);
  return row ? toMessageDto(row) : null;
}

/** Puts the personal-chat link of each group in place of the token (or removes the token without a party). */
function textForGroup(template: string, groupId: number, party: PartyDto | null) {
  if (!party) return template.replaceAll(LINK_TOKEN, "").trim();
  const link = entryLink(party.id, party.name, groupId);
  return template.includes(LINK_TOKEN) ? template.replaceAll(LINK_TOKEN, link) : `${template.trim()}\n\n${link}`;
}

/** Creates one message per group. Without a time, the messages are sent at once. */
export async function broadcast(input: {
  groupIds: number[];
  partyId: number | null;
  text: string;
  mediaId: string | null;
  scheduledAt: string | null;
}) {
  const party = input.partyId ? getParty(input.partyId) : null;
  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO wa_group_messages (group_id, party_id, text, media_id, status, scheduled_at, created_at)
     VALUES (?, ?, ?, ?, 'scheduled', ?, ?)`,
  );
  const ids = db.transaction(() =>
    input.groupIds
      .filter((g) => groupStmt.get(g))
      .map((g) =>
        Number(insert.run(g, party?.id ?? null, textForGroup(input.text, g, party), input.mediaId, input.scheduledAt ?? now, now).lastInsertRowid),
      ),
  )();
  if (!input.scheduledAt) for (const id of ids) await sendGroupMessage(id);
  return ids;
}

export async function sendGroupMessage(id: number) {
  // Claim the message, so the scheduler and "send now" never send it twice.
  const claimed = db
    .prepare("UPDATE wa_group_messages SET status='sending', error=NULL WHERE id=? AND status IN ('scheduled','failed')")
    .run(id).changes;
  if (!claimed) return;
  const row = db.prepare<[number], GroupMessageRow>("SELECT * FROM wa_group_messages WHERE id = ?").get(id)!;
  try {
    let simulated = 1;
    if (whatsappLive()) {
      const group = groupStmt.get(row.group_id);
      if (!group?.chat_id) throw new Error("לקבוצה אין מזהה וואטסאפ (chat id), ולכן אי אפשר לשלוח אליה.");
      const media = row.media_id ? getMedia(row.media_id) : undefined;
      if (media) await sendFileByUrl(group.chat_id, publicMediaUrl(media.file_name), media.file_name, row.text);
      else await sendText(group.chat_id, row.text);
      simulated = 0;
    }
    db.prepare("UPDATE wa_group_messages SET status='sent', sent_at=?, simulated=? WHERE id=?").run(nowIso(), simulated, id);
  } catch (err) {
    db.prepare("UPDATE wa_group_messages SET status='failed', error=? WHERE id=?").run(
      err instanceof Error ? err.message : String(err),
      id,
    );
  }
}

export function deleteGroupMessage(id: number) {
  db.prepare("DELETE FROM wa_group_messages WHERE id = ? AND status != 'sending'").run(id);
}

export function startGroupScheduler() {
  db.prepare(
    "UPDATE wa_group_messages SET status='failed', error='השליחה נקטעה בעקבות הפעלה מחדש של השרת. נסו שוב.' WHERE status='sending'",
  ).run();
  const due = db.prepare<[string], { id: number }>(
    "SELECT id FROM wa_group_messages WHERE status='scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 20",
  );
  const tick = async () => {
    for (const { id } of due.all(nowIso())) await sendGroupMessage(id);
  };
  setInterval(() => void tick(), 20_000);
  setTimeout(() => void tick(), 4_000);
}

/* ---------------- announcement text ---------------- */

function israelDate(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("he-IL", {
      timeZone: config.timezone,
      weekday: "long",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day}.${parts.month} · ${parts.hour}:${parts.minute}`;
}

const cleanName = (name: string) => name.replace(/^\[[^\]]*\]\s*/, "");

/** A ready announcement built from the party details (no AI). */
export function announcementTemplate(party: PartyDto) {
  const lines = [`🎉 *${cleanName(party.name)}*`, ""];
  if (party.startsAt) lines.push(`📅 ${israelDate(party.startsAt)}`);
  const place = [party.venueName, party.city].filter(Boolean).join(", ");
  if (place) lines.push(`📍 ${place}`);
  if (party.lineup) lines.push(`🎧 ${party.lineup}`);
  if (party.minPrice) lines.push(`🎟️ כרטיסים החל מ-₪${party.minPrice}`);
  if (party.minAge) lines.push(`🔞 הכניסה מגיל ${party.minAge}`);
  lines.push("", "לפרטים ולכרטיסים, כתבו לנו בפרטי 👇", LINK_TOKEN);
  return lines.join("\n");
}

/** Lets Claude write a group announcement from the party details. */
export async function announcementWithAi(party: PartyDto) {
  const facts = {
    name: cleanName(party.name),
    date: party.startsAt ? israelDate(party.startsAt) : null,
    venue: party.venueName,
    city: party.city,
    region: party.region,
    lineup: party.lineup,
    description: party.description,
    music: party.categories.map((c) => c.name),
    ticket_tiers: party.ticketTiers,
    min_age: party.minAge,
    status: party.status,
  };
  const response = await getClient().beta.messages.create({
    model: config.anthropicModel,
    max_tokens: 4000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `You write WhatsApp group announcements for "${getSetting("company_name")}", an Israeli party promotion company. The groups are full of young party-goers who joined to hear about parties.

Write one announcement in Hebrew, in a young, exciting, natural tone:
- 5-9 short lines. WhatsApp formatting only: *bold* for the party name, no markdown headers or lists with dashes. A few fitting emojis.
- Use only the facts you are given. Do not invent artists, prices, transport, discounts or anything else.
- End with a short call to write to us in a private chat, and then the exact token ${LINK_TOKEN} alone on the last line. The system replaces it with the chat link.
- Output only the announcement text.`,
    messages: [{ role: "user", content: `Party details (JSON):\n${JSON.stringify(facts, null, 2)}` }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .trim();
  if (!text) throw new Error("לא התקבל טקסט מהמודל");
  return text.includes(LINK_TOKEN) ? text : `${text}\n\n${LINK_TOKEN}`;
}

/* ---------------- simulated contacts ---------------- */

const FIRST_NAMES = [
  "נועה", "עומר", "מאיה", "איתי", "שירה", "דניאל", "יעל", "רועי", "טל", "אור", "עדי", "ליאור",
  "נטע", "אלון", "מיכל", "יונתן", "הילה", "גיא", "רוני", "אביב", "שקד", "עידו", "ליה", "בר",
];
const LAST_INITIALS = ["כ.", "ל.", "מ.", "ש.", "ב.", "א.", "ר.", "ד.", "ג.", "ח."];

const chatExists = db.prepare<[string], { id: number }>("SELECT id FROM leads WHERE chat_id = ?");

/** A random Israeli-looking contact for the simulated number. The numbers use the 050-555 range. */
export function randomContact() {
  const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
  for (;;) {
    const phone = `97250555${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    const chatId = `${phone}@c.us`;
    if (!chatExists.get(chatId)) return { name: `${pick(FIRST_NAMES)} ${pick(LAST_INITIALS)}`, phone, chatId };
  }
}
