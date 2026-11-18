import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { AgentNotConfiguredError, agentConfigured, runAgentTurn } from "./agent/agent.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { importFromGoOut } from "./goout.js";
import { instagramConfigured, publishPost, testInstagramConnection } from "./instagram.js";
import {
  addLeadEvent,
  appendTranscript,
  createLead,
  deleteLead,
  getConversation,
  getLead,
  getLeadRow,
  listLeadEvents,
  listLeads,
  setBotPaused,
} from "./leads.js";
import { storeUploadedFile, toMediaDto, upload } from "./media.js";
import {
  createCategory,
  createParty,
  deleteCategory,
  deleteParty,
  getParty,
  listCategories,
  listParties,
  partyInput,
  PARTY_STATUSES,
  REGIONS,
  updateCategory,
  updateParty,
} from "./parties.js";
import {
  createPost,
  deletePost,
  getPost,
  getPostRow,
  listPosts,
  postInput,
  reschedulePost,
  updatePost,
  validateForPublishing,
} from "./posts.js";
import { getMediaMany } from "./media.js";
import { ensureWebhookToken, getSetting, publicSettings, setSetting, SETTING_DEFS, type SettingKey } from "./settings.js";
import { HttpError, idParam, parse } from "./http.js";
import { getInstanceSettings, getState, greenApiConfigured, setWebhook } from "./whatsapp/greenapi.js";
import { whatsappRoutes } from "./whatsapp/routes.js";
import { businessNumber, deliverToLead, whatsappLive } from "./whatsapp/transport.js";

export const api = Router();

/* ---------------- meta & dashboard ---------------- */

api.get("/meta", (_req, res) => {
  res.json({
    regions: REGIONS,
    partyStatuses: PARTY_STATUSES,
    companyName: getSetting("company_name"),
    whatsappBusinessNumber: getSetting("whatsapp_business_number"),
    instagramLive: instagramConfigured(),
    agentConfigured: agentConfigured(),
    agentModel: config.anthropicModel,
    greenApiConfigured: greenApiConfigured(),
    whatsappMode: getSetting("whatsapp_mode"),
    whatsappLive: whatsappLive(),
    whatsappNumber: businessNumber(),
  });
});

api.get("/dashboard", (_req, res) => {
  const one = <T>(sql: string) => db.prepare<[], T>(sql).get()!;
  res.json({
    upcomingParties: one<{ n: number }>(
      "SELECT COUNT(*) n FROM parties WHERE starts_at >= datetime('now') AND status IN ('on_sale','sold_out')",
    ).n,
    scheduledPosts: one<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE status = 'scheduled'").n,
    publishedThisWeek: one<{ n: number }>(
      "SELECT COUNT(*) n FROM posts WHERE status = 'published' AND published_at >= datetime('now','-7 days')",
    ).n,
    failedPosts: one<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE status = 'failed'").n,
    whatsappLeads: one<{ n: number }>("SELECT COUNT(*) n FROM leads WHERE channel = 'whatsapp'").n,
    linksSent: one<{ n: number }>("SELECT COUNT(*) n FROM lead_events WHERE type = 'link_sent'").n,
    needsHuman: one<{ n: number }>("SELECT COUNT(*) n FROM leads WHERE stage = 'needs_human' AND bot_paused = 1").n,
    nextPosts: listPosts({ from: new Date().toISOString() })
      .filter((p) => p.status === "scheduled")
      .slice(0, 6),
    upcoming: listParties({ upcomingOnly: true }).slice(0, 5),
  });
});

/* ---------------- categories ---------------- */

const categoryInput = z.object({ name: z.string().trim().min(1, "חסר שם"), color: z.string().default("grape") });

api.get("/categories", (_req, res) => res.json(listCategories()));
api.post("/categories", (req, res) => {
  const { name, color } = parse(categoryInput, req.body);
  try {
    res.json({ id: createCategory(name, color) });
  } catch {
    throw new HttpError(409, "כבר קיימת קטגוריה בשם הזה");
  }
});
api.put("/categories/:id", (req, res) => {
  const { name, color } = parse(categoryInput, req.body);
  updateCategory(idParam(req), name, color);
  res.json({ ok: true });
});
api.delete("/categories/:id", (req, res) => {
  deleteCategory(idParam(req));
  res.json({ ok: true });
});

/* ---------------- parties ---------------- */

api.get("/parties", (_req, res) => res.json(listParties()));
api.post("/parties", (req, res) => {
  const id = createParty(parse(partyInput, req.body));
  res.json(getParty(id));
});
api.post("/parties/import-goout", async (req, res) => {
  const { url } = parse(z.object({ url: z.string().min(1, "חסר קישור") }), req.body);
  try {
    res.json(await importFromGoOut(url));
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : "הייבוא נכשל");
  }
});
api.get("/parties/:id", (req, res) => {
  const party = getParty(idParam(req));
  if (!party) throw new HttpError(404, "המסיבה לא נמצאה");
  res.json(party);
});
api.put("/parties/:id", (req, res) => {
  const id = idParam(req);
  if (!getParty(id)) throw new HttpError(404, "המסיבה לא נמצאה");
  updateParty(id, parse(partyInput, req.body));
  res.json(getParty(id));
});
api.delete("/parties/:id", (req, res) => {
  deleteParty(idParam(req));
  res.json({ ok: true });
});

/* ---------------- media ---------------- */

api.post("/media", upload.array("files", 10), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, "לא התקבלו קבצים (תמונות או וידאו MP4/MOV בלבד)");
  const rows = [];
  for (const f of files) rows.push(await storeUploadedFile(f));
  res.json(rows.map(toMediaDto));
});

/* ---------------- posts ---------------- */

api.get("/posts", (req, res) => {
  res.json(
    listPosts({
      partyId: req.query.partyId ? Number(req.query.partyId) : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
    }),
  );
});

function checkPostForQueue(input: z.infer<typeof postInput>) {
  if (input.status !== "scheduled") return;
  if (!input.scheduledAt) throw new HttpError(400, "יש לבחור מועד פרסום");
  const invalid = validateForPublishing(input.type, getMediaMany(input.mediaIds));
  if (invalid) throw new HttpError(400, invalid);
}

api.post("/posts", (req, res) => {
  const input = parse(postInput, req.body);
  checkPostForQueue(input);
  res.json(getPost(createPost(input)));
});
api.put("/posts/:id", (req, res) => {
  const id = idParam(req);
  const row = getPostRow(id);
  if (!row) throw new HttpError(404, "הפוסט לא נמצא");
  if (row.status === "published" || row.status === "publishing") throw new HttpError(409, "פוסט שכבר פורסם לא ניתן לעריכה");
  const input = parse(postInput, req.body);
  checkPostForQueue(input);
  updatePost(id, input);
  res.json(getPost(id));
});
api.patch("/posts/:id/reschedule", (req, res) => {
  const id = idParam(req);
  const row = getPostRow(id);
  if (!row) throw new HttpError(404, "הפוסט לא נמצא");
  if (row.status === "published" || row.status === "publishing") throw new HttpError(409, "פוסט שכבר פורסם לא ניתן להזזה");
  const { scheduledAt } = parse(z.object({ scheduledAt: z.string().datetime({ offset: true }) }), req.body);
  reschedulePost(id, scheduledAt);
  res.json(getPost(id));
});
api.post("/posts/:id/publish-now", async (req, res) => {
  const id = idParam(req);
  const row = getPostRow(id);
  if (!row) throw new HttpError(404, "הפוסט לא נמצא");
  if (row.status === "published") throw new HttpError(409, "הפוסט כבר פורסם");
  await publishPost(id);
  res.json(getPost(id));
});
api.delete("/posts/:id", (req, res) => {
  deletePost(idParam(req));
  res.json({ ok: true });
});

/* ---------------- leads ---------------- */

api.get("/leads", (req, res) => {
  const channel = req.query.channel === "whatsapp" || req.query.channel === "simulation" ? req.query.channel : undefined;
  res.json(listLeads(channel));
});
api.get("/leads/:id", (req, res) => {
  const id = idParam(req);
  const lead = getLead(id);
  if (!lead) throw new HttpError(404, "הליד לא נמצא");
  res.json({ lead, transcript: getConversation(id).transcript, events: listLeadEvents(id) });
});
api.patch("/leads/:id", (req, res) => {
  const id = idParam(req);
  const { botPaused } = parse(z.object({ botPaused: z.boolean() }), req.body);
  setBotPaused(id, botPaused);
  addLeadEvent(id, botPaused ? "bot_paused" : "bot_resumed", {});
  res.json(getLead(id));
});
api.post("/leads/:id/send", async (req, res) => {
  const id = idParam(req);
  const lead = getLeadRow(id);
  if (!lead) throw new HttpError(404, "הליד לא נמצא");
  const { text } = parse(z.object({ text: z.string().trim().min(1) }), req.body);
  if (lead.channel === "whatsapp" && !lead.chat_id) throw new HttpError(400, "אין מספר וואטסאפ לליד");
  await deliverToLead(lead, text);
  appendTranscript(id, { role: "human_agent", text });
  if (!lead.bot_paused) setBotPaused(id, true);
  res.json({ ok: true });
});
api.delete("/leads/:id", (req, res) => {
  deleteLead(idParam(req));
  res.json({ ok: true });
});

/* ---------------- agent simulation ---------------- */

api.post("/simulation", (req, res) => {
  const { partyId } = parse(z.object({ partyId: z.number().int().nullable().default(null) }), req.body);
  const id = createLead({ channel: "simulation", sourcePartyId: partyId });
  addLeadEvent(id, "lead_created", { channel: "simulation", partyId });
  res.json({ leadId: id });
});
api.post("/simulation/:id/message", async (req, res) => {
  const id = idParam(req);
  const lead = getLeadRow(id);
  if (!lead || lead.channel !== "simulation") throw new HttpError(404, "סימולציה לא נמצאה");
  const { text } = parse(z.object({ text: z.string().trim().min(1).max(2000) }), req.body);
  try {
    const result = await runAgentTurn(id, text, "simulation");
    res.json({ ...result, lead: getLead(id), transcript: getConversation(id).transcript, events: listLeadEvents(id) });
  } catch (err) {
    if (err instanceof AgentNotConfiguredError) throw new HttpError(503, err.message);
    throw err;
  }
});

/* ---------------- WhatsApp number, groups and chats ---------------- */

api.use("/whatsapp", whatsappRoutes);

/* ---------------- settings ---------------- */

api.get("/settings", (_req, res) => {
  res.json({
    ...publicSettings(),
    webhook_url: `${config.publicBaseUrl}/webhooks/greenapi`,
    public_base_url: config.publicBaseUrl,
  });
});
api.put("/settings", (req, res) => {
  const body = parse(z.record(z.string(), z.string()), req.body);
  for (const [key, value] of Object.entries(body)) {
    if (!(key in SETTING_DEFS)) continue;
    const def = SETTING_DEFS[key as SettingKey];
    if (def.secret && value.includes("••••")) continue; // masked value sent back unchanged
    setSetting(key as SettingKey, value.trim());
  }
  res.json(publicSettings());
});
api.post("/settings/instagram/test", async (_req, res) => {
  try {
    const r = await testInstagramConnection();
    if (!getSetting("ig_user_id") && r.userId) setSetting("ig_user_id", r.userId);
    res.json(r);
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : "הבדיקה נכשלה");
  }
});
api.get("/settings/whatsapp/status", async (_req, res) => {
  if (!greenApiConfigured()) {
    res.json({ configured: false });
    return;
  }
  try {
    const [state, settings] = await Promise.all([getState(), getInstanceSettings()]);
    res.json({
      configured: true,
      state: state.stateInstance,
      phone: settings.wid?.replace("@c.us", "") ?? null,
      webhookUrl: settings.webhookUrl ?? null,
      expectedWebhookUrl: `${config.publicBaseUrl}/webhooks/greenapi`,
    });
  } catch (err) {
    res.json({ configured: true, error: err instanceof Error ? err.message : String(err) });
  }
});
api.post("/settings/whatsapp/connect-webhook", async (_req, res) => {
  const token = ensureWebhookToken();
  try {
    await setWebhook(`${config.publicBaseUrl}/webhooks/greenapi`, token);
    res.json({ ok: true });
  } catch (err) {
    throw new HttpError(422, err instanceof Error ? err.message : "החיבור נכשל");
  }
});

/* ---------------- errors ---------------- */

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "שגיאת שרת" });
}
