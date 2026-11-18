import { z } from "zod";
import { db, nowIso, parseJson } from "./db.js";
import { getMediaMany, toMediaDto } from "./media.js";

export const POST_TYPES = ["feed", "carousel", "reel", "story"] as const;
export const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "failed"] as const;

export interface PostRow {
  id: number;
  party_id: number | null;
  type: (typeof POST_TYPES)[number];
  caption: string;
  media_ids: string;
  scheduled_at: string | null;
  status: (typeof POST_STATUSES)[number];
  ig_media_id: string | null;
  permalink: string | null;
  error: string | null;
  simulated: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const partyName = db.prepare<[number], { name: string }>("SELECT name FROM parties WHERE id = ?");

export function toPostDto(row: PostRow) {
  const mediaIds = parseJson<string[]>(row.media_ids, []);
  return {
    id: row.id,
    partyId: row.party_id,
    partyName: row.party_id ? (partyName.get(row.party_id)?.name ?? null) : null,
    type: row.type,
    caption: row.caption,
    media: getMediaMany(mediaIds).map(toMediaDto),
    scheduledAt: row.scheduled_at,
    status: row.status,
    igMediaId: row.ig_media_id,
    permalink: row.permalink,
    error: row.error,
    simulated: Boolean(row.simulated),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export type PostDto = ReturnType<typeof toPostDto>;

export const postInput = z.object({
  partyId: z.number().int().nullable().default(null),
  type: z.enum(POST_TYPES),
  caption: z.string().max(2200, "כיתוב ארוך מ-2,200 תווים").default(""),
  mediaIds: z.array(z.string()).default([]),
  scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
  /** "draft" keeps it out of the queue; "scheduled" queues it for automatic upload. */
  status: z.enum(["draft", "scheduled"]).default("scheduled"),
});
export type PostInput = z.infer<typeof postInput>;

/** Instagram rules for each post type. Returns a Hebrew error or null. */
export function validateForPublishing(type: PostInput["type"], media: { kind: string }[]): string | null {
  if (media.length === 0) return "יש להוסיף לפחות קובץ מדיה אחד";
  if (type === "feed" && media.length !== 1) return "פוסט רגיל מקבל קובץ אחד. לכמה קבצים בחרו קרוסלה";
  if (type === "feed" && media[0]!.kind !== "image") return "לפוסט וידאו בחרו ריל";
  if (type === "reel" && (media.length !== 1 || media[0]!.kind !== "video")) return "ריל צריך קובץ וידאו אחד";
  if (type === "story" && media.length !== 1) return "סטורי מקבל קובץ אחד";
  if (type === "carousel" && (media.length < 2 || media.length > 10)) return "קרוסלה צריכה בין 2 ל-10 קבצים";
  return null;
}

const getStmt = db.prepare<[number], PostRow>("SELECT * FROM posts WHERE id = ?");
export function getPostRow(id: number) {
  return getStmt.get(id);
}
export function getPost(id: number) {
  const row = getStmt.get(id);
  return row ? toPostDto(row) : null;
}

export function listPosts(opts: { partyId?: number; from?: string; to?: string }) {
  const where: string[] = [];
  const params: Record<string, string | number> = {};
  if (opts.partyId) {
    where.push("party_id = @partyId");
    params.partyId = opts.partyId;
  }
  if (opts.from) {
    where.push("COALESCE(published_at, scheduled_at) >= @from");
    params.from = opts.from;
  }
  if (opts.to) {
    where.push("COALESCE(published_at, scheduled_at) < @to");
    params.to = opts.to;
  }
  const rows = db
    .prepare<Record<string, string | number>, PostRow>(
      `SELECT * FROM posts ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY COALESCE(published_at, scheduled_at)`,
    )
    .all(params);
  return rows.map(toPostDto);
}

export function createPost(input: PostInput) {
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO posts (party_id, type, caption, media_ids, scheduled_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.partyId,
      input.type,
      input.caption,
      JSON.stringify(input.mediaIds),
      input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
      input.status,
      now,
      now,
    );
  return Number(info.lastInsertRowid);
}

export function updatePost(id: number, input: PostInput) {
  db.prepare(
    `UPDATE posts SET party_id = ?, type = ?, caption = ?, media_ids = ?, scheduled_at = ?, status = ?,
       error = NULL, updated_at = ? WHERE id = ?`,
  ).run(
    input.partyId,
    input.type,
    input.caption,
    JSON.stringify(input.mediaIds),
    input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
    input.status,
    nowIso(),
    id,
  );
}

export function reschedulePost(id: number, scheduledAt: string) {
  db.prepare("UPDATE posts SET scheduled_at = ?, updated_at = ? WHERE id = ?").run(
    new Date(scheduledAt).toISOString(),
    nowIso(),
    id,
  );
}

export function deletePost(id: number) {
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
}
