import { z } from "zod";
import { db, nowIso, parseJson } from "./db.js";
import { getMedia, toMediaDto } from "./media.js";

export const REGIONS = [
  "צפון",
  "חיפה והקריות",
  "שרון",
  "מרכז",
  "תל אביב",
  "ירושלים",
  "שפלה",
  "דרום",
  "אילת",
] as const;

export const PARTY_STATUSES = ["draft", "on_sale", "sold_out", "cancelled"] as const;

export interface TicketTier {
  name: string;
  price: number;
}

interface PartyRow {
  id: number;
  name: string;
  status: (typeof PARTY_STATUSES)[number];
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  description: string | null;
  lineup: string | null;
  agent_notes: string | null;
  min_age: number | null;
  ticket_url: string | null;
  ticket_tiers: string;
  cover_media_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

const categoriesForParty = db.prepare<[number], Category>(
  `SELECT c.id, c.name, c.color FROM categories c
   JOIN party_categories pc ON pc.category_id = c.id
   WHERE pc.party_id = ? ORDER BY c.name`,
);

const postCounts = db.prepare<[number], { scheduled: number; published: number }>(
  `SELECT
     SUM(CASE WHEN status IN ('scheduled','publishing') THEN 1 ELSE 0 END) AS scheduled,
     SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
   FROM posts WHERE party_id = ?`,
);

export function minPrice(tiers: TicketTier[]): number | null {
  const prices = tiers.map((t) => t.price).filter((p) => Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function toPartyDto(row: PartyRow) {
  const tiers = parseJson<TicketTier[]>(row.ticket_tiers, []);
  const cover = row.cover_media_id ? getMedia(row.cover_media_id) : undefined;
  const counts = postCounts.get(row.id);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venueName: row.venue_name,
    address: row.address,
    city: row.city,
    region: row.region,
    description: row.description,
    lineup: row.lineup,
    agentNotes: row.agent_notes,
    minAge: row.min_age,
    ticketUrl: row.ticket_url,
    ticketTiers: tiers,
    minPrice: minPrice(tiers),
    cover: cover ? toMediaDto(cover) : null,
    categories: categoriesForParty.all(row.id),
    scheduledPosts: counts?.scheduled ?? 0,
    publishedPosts: counts?.published ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export type PartyDto = ReturnType<typeof toPartyDto>;

export const partyInput = z.object({
  name: z.string().trim().min(1, "חסר שם מסיבה"),
  status: z.enum(PARTY_STATUSES).default("draft"),
  startsAt: z.string().datetime({ offset: true }).nullable().default(null),
  endsAt: z.string().datetime({ offset: true }).nullable().default(null),
  venueName: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  region: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  lineup: z.string().nullable().default(null),
  agentNotes: z.string().nullable().default(null),
  minAge: z.number().int().min(0).max(99).nullable().default(null),
  ticketUrl: z.string().url("קישור כרטיסים לא תקין").nullable().or(z.literal("").transform(() => null)).default(null),
  ticketTiers: z
    .array(z.object({ name: z.string().trim().min(1), price: z.number().min(0) }))
    .default([]),
  coverMediaId: z.string().nullable().default(null),
  categoryIds: z.array(z.number().int()).default([]),
});
export type PartyInput = z.infer<typeof partyInput>;

const getStmt = db.prepare<[number], PartyRow>("SELECT * FROM parties WHERE id = ?");

export function getParty(id: number) {
  const row = getStmt.get(id);
  return row ? toPartyDto(row) : null;
}

export function listParties(opts: { upcomingOnly?: boolean } = {}) {
  const rows = db
    .prepare<[], PartyRow>(
      `SELECT * FROM parties ${opts.upcomingOnly ? "WHERE starts_at IS NULL OR starts_at >= datetime('now','-12 hours')" : ""}
       ORDER BY CASE WHEN starts_at IS NULL THEN 1 ELSE 0 END, starts_at`,
    )
    .all();
  return rows.map(toPartyDto);
}

function setCategories(partyId: number, categoryIds: number[]) {
  db.prepare("DELETE FROM party_categories WHERE party_id = ?").run(partyId);
  const ins = db.prepare("INSERT OR IGNORE INTO party_categories (party_id, category_id) VALUES (?, ?)");
  for (const cid of categoryIds) ins.run(partyId, cid);
}

function toRowParams(input: PartyInput) {
  return {
    name: input.name,
    status: input.status,
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    venue_name: input.venueName,
    address: input.address,
    city: input.city,
    region: input.region,
    description: input.description,
    lineup: input.lineup,
    agent_notes: input.agentNotes,
    min_age: input.minAge,
    ticket_url: input.ticketUrl,
    ticket_tiers: JSON.stringify(input.ticketTiers),
    cover_media_id: input.coverMediaId,
  };
}

export const createParty = db.transaction((input: PartyInput) => {
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO parties (name, status, starts_at, ends_at, venue_name, address, city, region, description, lineup,
         agent_notes, min_age, ticket_url, ticket_tiers, cover_media_id, created_at, updated_at)
       VALUES (@name, @status, @starts_at, @ends_at, @venue_name, @address, @city, @region, @description, @lineup,
         @agent_notes, @min_age, @ticket_url, @ticket_tiers, @cover_media_id, @now, @now)`,
    )
    .run({ ...toRowParams(input), now });
  const id = Number(info.lastInsertRowid);
  setCategories(id, input.categoryIds);
  return id;
});

export const updateParty = db.transaction((id: number, input: PartyInput) => {
  db.prepare(
    `UPDATE parties SET name=@name, status=@status, starts_at=@starts_at, ends_at=@ends_at, venue_name=@venue_name,
       address=@address, city=@city, region=@region, description=@description, lineup=@lineup, agent_notes=@agent_notes,
       min_age=@min_age, ticket_url=@ticket_url, ticket_tiers=@ticket_tiers, cover_media_id=@cover_media_id,
       updated_at=@now WHERE id=@id`,
  ).run({ ...toRowParams(input), now: nowIso(), id });
  setCategories(id, input.categoryIds);
});

export function deleteParty(id: number) {
  db.prepare("DELETE FROM parties WHERE id = ?").run(id);
}

/* ---------------- categories ---------------- */

export function listCategories() {
  return db.prepare<[], Category>("SELECT id, name, color FROM categories ORDER BY name").all();
}

export function createCategory(name: string, color: string) {
  const info = db.prepare("INSERT INTO categories (name, color) VALUES (?, ?)").run(name.trim(), color);
  return Number(info.lastInsertRowid);
}

export function updateCategory(id: number, name: string, color: string) {
  db.prepare("UPDATE categories SET name = ?, color = ? WHERE id = ?").run(name.trim(), color, id);
}

export function deleteCategory(id: number) {
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

/* ---------------- search for the sales agent ---------------- */

export interface PartySearch {
  genres: string[] | null;
  region: string | null;
  maxPrice: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/** Upcoming parties that are on sale, filtered for the sales agent. */
export function searchParties(q: PartySearch) {
  const all = db
    .prepare<[], PartyRow>(
      `SELECT * FROM parties WHERE status = 'on_sale' AND starts_at IS NOT NULL
       AND starts_at >= datetime('now','-3 hours') ORDER BY starts_at`,
    )
    .all()
    .map(toPartyDto);

  const wanted = (q.genres ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean);
  const from = q.dateFrom ? new Date(q.dateFrom).getTime() : null;
  const to = q.dateTo ? new Date(q.dateTo).getTime() + 24 * 3600 * 1000 : null;

  const matches = all.filter((p) => {
    if (q.region && p.region !== q.region) return false;
    if (q.maxPrice != null && p.minPrice != null && p.minPrice > q.maxPrice) return false;
    const t = new Date(p.startsAt!).getTime();
    if (from != null && t < from) return false;
    if (to != null && t > to) return false;
    if (wanted.length) {
      const names = p.categories.map((c) => c.name.toLowerCase());
      const hit = wanted.some((w) => names.some((n) => n.includes(w) || w.includes(n)));
      if (!hit) return false;
    }
    return true;
  });
  return { matches, totalUpcoming: all.length };
}
