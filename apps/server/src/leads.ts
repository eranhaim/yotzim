import { db, nowIso, parseJson } from "./db.js";

export const LEAD_STAGES = ["new", "qualifying", "pitched", "link_sent", "needs_human", "not_interested"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export interface LeadRow {
  id: number;
  channel: "whatsapp" | "simulation";
  chat_id: string | null;
  phone: string | null;
  wa_name: string | null;
  name: string | null;
  region: string | null;
  city: string | null;
  genres: string;
  budget: number | null;
  age: number | null;
  group_size: number | null;
  preferred_dates: string | null;
  notes: string | null;
  stage: LeadStage;
  interested_party_id: number | null;
  source_party_id: number | null;
  source_group_id: number | null;
  simulated: number;
  bot_paused: number;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface TranscriptEntry {
  role: "user" | "assistant" | "human_agent" | "system";
  text: string;
  at: string;
}

const partyName = db.prepare<[number], { name: string }>("SELECT name FROM parties WHERE id = ?");
const groupName = db.prepare<[number], { name: string }>("SELECT name FROM wa_groups WHERE id = ?");

export function toLeadDto(row: LeadRow) {
  return {
    id: row.id,
    channel: row.channel,
    phone: row.phone,
    waName: row.wa_name,
    name: row.name,
    region: row.region,
    city: row.city,
    genres: parseJson<string[]>(row.genres, []),
    budget: row.budget,
    age: row.age,
    groupSize: row.group_size,
    preferredDates: row.preferred_dates,
    notes: row.notes,
    stage: row.stage,
    interestedPartyId: row.interested_party_id,
    interestedPartyName: row.interested_party_id ? (partyName.get(row.interested_party_id)?.name ?? null) : null,
    sourcePartyId: row.source_party_id,
    sourcePartyName: row.source_party_id ? (partyName.get(row.source_party_id)?.name ?? null) : null,
    sourceGroupId: row.source_group_id,
    sourceGroupName: row.source_group_id ? (groupName.get(row.source_group_id)?.name ?? null) : null,
    simulated: Boolean(row.simulated),
    botPaused: Boolean(row.bot_paused),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}
export type LeadDto = ReturnType<typeof toLeadDto>;

const getStmt = db.prepare<[number], LeadRow>("SELECT * FROM leads WHERE id = ?");
export function getLeadRow(id: number) {
  return getStmt.get(id);
}
export function getLead(id: number) {
  const row = getStmt.get(id);
  return row ? toLeadDto(row) : null;
}

export function listLeads(channel?: "whatsapp" | "simulation") {
  const rows = channel
    ? db
        .prepare<[string], LeadRow>(
          "SELECT * FROM leads WHERE channel = ? ORDER BY COALESCE(last_message_at, created_at) DESC",
        )
        .all(channel)
    : db.prepare<[], LeadRow>("SELECT * FROM leads ORDER BY COALESCE(last_message_at, created_at) DESC").all();
  return rows.map(toLeadDto);
}

export function createLead(data: {
  channel: "whatsapp" | "simulation";
  chatId?: string | null;
  phone?: string | null;
  waName?: string | null;
  sourcePartyId?: number | null;
  sourceGroupId?: number | null;
  simulated?: boolean;
}) {
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO leads (channel, chat_id, phone, wa_name, source_party_id, source_group_id, simulated, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.channel,
      data.chatId ?? null,
      data.phone ?? null,
      data.waName ?? null,
      data.sourcePartyId ?? null,
      data.sourceGroupId ?? null,
      data.simulated ? 1 : 0,
      now,
      now,
    );
  const id = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO conversations (lead_id, updated_at) VALUES (?, ?)").run(id, now);
  return id;
}

export function findLeadByChatId(chatId: string) {
  return db.prepare<[string], LeadRow>("SELECT * FROM leads WHERE chat_id = ?").get(chatId);
}

export interface LeadProfilePatch {
  name?: string | null;
  region?: string | null;
  city?: string | null;
  genres?: string[] | null;
  budget?: number | null;
  age?: number | null;
  group_size?: number | null;
  preferred_dates?: string | null;
  notes?: string | null;
  stage?: LeadStage | null;
  interested_party_id?: number | null;
}

/** Merges only the fields that have a value; null/undefined means "unchanged". */
export function patchLead(id: number, patch: LeadProfilePatch) {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, now: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (key === "genres") {
      const current = parseJson<string[]>(getStmt.get(id)?.genres, []);
      const merged = Array.from(new Set([...current, ...(value as string[])]));
      sets.push("genres = @genres");
      params.genres = JSON.stringify(merged);
      continue;
    }
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE leads SET ${sets.join(", ")}, updated_at = @now WHERE id = @id`).run(params);
}

export function setBotPaused(id: number, paused: boolean) {
  db.prepare("UPDATE leads SET bot_paused = ?, updated_at = ? WHERE id = ?").run(paused ? 1 : 0, nowIso(), id);
}

export function deleteLead(id: number) {
  db.prepare("DELETE FROM leads WHERE id = ?").run(id);
}

/* ---------------- conversation ---------------- */

export function getConversation(leadId: number) {
  const row = db
    .prepare<[number], { api_messages: string; transcript: string }>(
      "SELECT api_messages, transcript FROM conversations WHERE lead_id = ?",
    )
    .get(leadId);
  return {
    apiMessages: parseJson<unknown[]>(row?.api_messages, []),
    transcript: parseJson<TranscriptEntry[]>(row?.transcript, []),
  };
}

export function saveApiMessages(leadId: number, apiMessages: unknown[]) {
  db.prepare("UPDATE conversations SET api_messages = ?, updated_at = ? WHERE lead_id = ?").run(
    JSON.stringify(apiMessages),
    nowIso(),
    leadId,
  );
}

export function appendTranscript(leadId: number, entry: Omit<TranscriptEntry, "at">) {
  const { transcript } = getConversation(leadId);
  const at = nowIso();
  transcript.push({ ...entry, at });
  db.prepare("UPDATE conversations SET transcript = ?, updated_at = ? WHERE lead_id = ?").run(
    JSON.stringify(transcript),
    at,
    leadId,
  );
  db.prepare("UPDATE leads SET last_message_at = ? WHERE id = ?").run(at, leadId);
}

/* ---------------- events ---------------- */

export function addLeadEvent(leadId: number, type: string, data: Record<string, unknown> = {}) {
  db.prepare("INSERT INTO lead_events (lead_id, type, data, created_at) VALUES (?, ?, ?, ?)").run(
    leadId,
    type,
    JSON.stringify(data),
    nowIso(),
  );
}

export function listLeadEvents(leadId: number) {
  return db
    .prepare<[number], { id: number; type: string; data: string; created_at: string }>(
      "SELECT * FROM lead_events WHERE lead_id = ? ORDER BY id",
    )
    .all(leadId)
    .map((e) => ({ id: e.id, type: e.type, data: parseJson<Record<string, unknown>>(e.data, {}), createdAt: e.created_at }));
}
