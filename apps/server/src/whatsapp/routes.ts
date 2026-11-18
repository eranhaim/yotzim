import { Router } from "express";
import { z } from "zod";
import { agentConfigured } from "../agent/agent.js";
import { db } from "../db.js";
import { HttpError, idParam, parse } from "../http.js";
import { appendTranscript, getConversation, getLead, listLeadEvents, listLeads } from "../leads.js";
import { getParty } from "../parties.js";
import { getSetting } from "../settings.js";
import {
  announcementTemplate,
  announcementWithAi,
  broadcast,
  createGroup,
  deleteGroup,
  deleteGroupMessage,
  getGroup,
  getGroupMessage,
  getGroupRow,
  listGroupMessages,
  listGroups,
  randomContact,
  sendGroupMessage,
  updateGroup,
} from "./groups.js";
import { greenApiConfigured } from "./greenapi.js";
import { businessNumber, entryText, whatsappLive } from "./transport.js";
import { answer, ensureWhatsAppLead } from "./webhook.js";

export const whatsappRoutes = Router();

whatsappRoutes.get("/overview", (_req, res) => {
  const one = <T>(sql: string) => db.prepare<[], T>(sql).get()!;
  const groups = listGroups();
  res.json({
    mode: getSetting("whatsapp_mode"),
    live: whatsappLive(),
    greenApiConfigured: greenApiConfigured(),
    number: businessNumber(),
    numberIsSet: Boolean(getSetting("whatsapp_business_number")),
    agentEnabled: getSetting("whatsapp_agent_enabled") === "true",
    agentConfigured: agentConfigured(),
    stats: {
      groups: groups.filter((g) => g.kind === "group").length,
      communities: groups.filter((g) => g.kind === "community").length,
      // People are counted once: through their group, or through a community without listed groups.
      members: groups
        .filter((g) => g.kind === "group" || g.groupCount === 0)
        .reduce((s, g) => s + g.members, 0),
      chats: one<{ n: number }>("SELECT COUNT(*) n FROM leads WHERE channel = 'whatsapp'").n,
      fromGroups: one<{ n: number }>("SELECT COUNT(*) n FROM leads WHERE source_group_id IS NOT NULL").n,
      linksSent: one<{ n: number }>(
        "SELECT COUNT(*) n FROM lead_events e JOIN leads l ON l.id = e.lead_id WHERE e.type = 'link_sent' AND l.channel = 'whatsapp'",
      ).n,
      announcementsSent: one<{ n: number }>("SELECT COUNT(*) n FROM wa_group_messages WHERE status = 'sent'").n,
      announcementsScheduled: one<{ n: number }>("SELECT COUNT(*) n FROM wa_group_messages WHERE status = 'scheduled'").n,
    },
  });
});

/* ---------------- groups ---------------- */

const groupInput = z.object({
  name: z.string().trim().min(1, "חסר שם קבוצה"),
  kind: z.enum(["group", "community"]).default("group"),
  parentId: z.number().int().nullable().default(null),
  chatId: z
    .string()
    .trim()
    .regex(/^[\d-]+@g\.us$/, "מזהה קבוצה בפורמט 120363…@g.us")
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
  members: z.number().int().min(0).max(100000).default(0),
  region: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  categoryIds: z.array(z.number().int()).default([]),
});

whatsappRoutes.get("/groups", (_req, res) => res.json(listGroups()));
whatsappRoutes.post("/groups", (req, res) => {
  const input = parse(groupInput, req.body);
  if (input.parentId && getGroupRow(input.parentId)?.kind !== "community") throw new HttpError(400, "אפשר לשייך קבוצה רק לקהילה");
  res.json(getGroup(createGroup(input)));
});
whatsappRoutes.put("/groups/:id", (req, res) => {
  const id = idParam(req);
  if (!getGroupRow(id)) throw new HttpError(404, "הקבוצה לא נמצאה");
  const input = parse(groupInput, req.body);
  if (input.parentId && getGroupRow(input.parentId)?.kind !== "community") throw new HttpError(400, "אפשר לשייך קבוצה רק לקהילה");
  updateGroup(id, input);
  res.json(getGroup(id));
});
whatsappRoutes.delete("/groups/:id", (req, res) => {
  deleteGroup(idParam(req));
  res.json({ ok: true });
});
whatsappRoutes.get("/groups/:id/messages", (req, res) => res.json(listGroupMessages(idParam(req))));

/* ---------------- announcements ---------------- */

whatsappRoutes.get("/announcement", (req, res) => {
  const party = getParty(Number(req.query.partyId));
  if (!party) throw new HttpError(404, "המסיבה לא נמצאה");
  res.json({ text: announcementTemplate(party) });
});
whatsappRoutes.post("/announcement/ai", async (req, res) => {
  const { partyId } = parse(z.object({ partyId: z.number().int() }), req.body);
  const party = getParty(partyId);
  if (!party) throw new HttpError(404, "המסיבה לא נמצאה");
  if (!agentConfigured()) throw new HttpError(503, "חסר ANTHROPIC_API_KEY בשרת");
  try {
    res.json({ text: await announcementWithAi(party) });
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : "הכתיבה נכשלה");
  }
});

whatsappRoutes.post("/broadcast", async (req, res) => {
  const input = parse(
    z.object({
      groupIds: z.array(z.number().int()).min(1, "יש לבחור לפחות קבוצה אחת"),
      partyId: z.number().int().nullable().default(null),
      text: z.string().trim().min(1, "חסר טקסט").max(4000),
      mediaId: z.string().nullable().default(null),
      scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
    }),
    req.body,
  );
  if (input.scheduledAt && new Date(input.scheduledAt) < new Date()) throw new HttpError(400, "אי אפשר לתזמן לזמן שעבר");
  const ids = await broadcast(input);
  res.json({ ids, messages: ids.map(getGroupMessage) });
});
whatsappRoutes.post("/messages/:id/send-now", async (req, res) => {
  const id = idParam(req);
  await sendGroupMessage(id);
  res.json(getGroupMessage(id));
});
whatsappRoutes.delete("/messages/:id", (req, res) => {
  deleteGroupMessage(idParam(req));
  res.json({ ok: true });
});

/* ---------------- private chats ---------------- */

whatsappRoutes.get("/chats", (_req, res) => {
  res.json(
    listLeads("whatsapp").map((lead) => {
      const last = getConversation(lead.id).transcript.at(-1);
      return { ...lead, preview: last ? { role: last.role, text: last.text.slice(0, 120), at: last.at } : null };
    }),
  );
});

/**
 * Simulation: a new contact writes to the number. With a group message, the contact is a
 * member of that group who clicked the link in the announcement.
 */
whatsappRoutes.post("/sim/contact", (req, res) => {
  const { messageId, partyId, name } = parse(
    z.object({
      messageId: z.number().int().nullable().default(null),
      partyId: z.number().int().nullable().default(null),
      name: z.string().trim().nullable().default(null),
    }),
    req.body,
  );
  const contact = randomContact();
  if (name) contact.name = name;
  let text = "היי! מה יש בסופ״ש הקרוב? 🙂";
  const msg = messageId ? getGroupMessage(messageId) : null;
  if (msg?.partyId && msg.partyName) text = entryText(msg.partyId, msg.partyName, msg.groupId);
  else if (partyId) {
    const party = getParty(partyId);
    if (party) text = entryText(party.id, party.name);
  }
  res.json({ ...contact, text });
});

/** Simulation: a message from a simulated contact to the number. Runs the same intake as the real webhook. */
whatsappRoutes.post("/sim/inbound", async (req, res) => {
  const { chatId, name, text } = parse(
    z.object({
      chatId: z.string().regex(/^\d{8,15}@c\.us$/, "מזהה צ'אט לא תקין"),
      name: z.string().trim().nullable().default(null),
      text: z.string().trim().min(1).max(2000),
    }),
    req.body,
  );
  const lead = ensureWhatsAppLead(chatId, name, text, true);
  if (!lead.simulated) throw new HttpError(400, "זה צ'אט אמיתי: אי אפשר לכתוב בשם הלקוח");

  if (getSetting("whatsapp_agent_enabled") !== "true" || lead.bot_paused || !agentConfigured()) {
    appendTranscript(lead.id, { role: "user", text });
  } else {
    await answer(lead.id, text);
  }
  res.json({ lead: getLead(lead.id), transcript: getConversation(lead.id).transcript, events: listLeadEvents(lead.id) });
});
