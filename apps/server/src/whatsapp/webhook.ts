import crypto from "node:crypto";
import type { Request, Response } from "express";
import { AgentNotConfiguredError, runAgentTurn } from "../agent/agent.js";
import { db } from "../db.js";
import { addLeadEvent, appendTranscript, createLead, findLeadByChatId, getLeadRow, setBotPaused, type LeadRow } from "../leads.js";
import { getParty } from "../parties.js";
import { getSetting } from "../settings.js";
import { deliverToLead, parseEntryCode } from "./transport.js";

/** Subset of the GREEN-API webhook body that we use. */
interface GreenWebhook {
  typeWebhook?: string;
  idMessage?: string;
  senderData?: { chatId?: string; sender?: string; senderName?: string; chatName?: string };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string };
    fileMessageData?: { caption?: string };
  };
}

function extractText(body: GreenWebhook): string | null {
  const m = body.messageData;
  if (!m) return null;
  switch (m.typeMessage) {
    case "textMessage":
      return m.textMessageData?.textMessage ?? null;
    case "extendedTextMessage":
    case "quotedMessage":
      return m.extendedTextMessageData?.text ?? null;
    case "imageMessage":
    case "videoMessage":
    case "documentMessage":
      return m.fileMessageData?.caption || null;
    default:
      return null;
  }
}

function tokenOk(req: Request) {
  const expected = getSetting("greenapi_webhook_token");
  if (!expected) return false;
  const header = req.get("authorization") ?? "";
  const given = header.replace(/^Bearer\s+/i, "") || String(req.query.token ?? "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/* People often send several short messages in a row; wait a moment and answer them together. */
const DEBOUNCE_MS = 3500;
const pending = new Map<string, { texts: string[]; timer: NodeJS.Timeout; leadId: number }>();

function queueMessage(chatId: string, leadId: number, text: string) {
  const entry = pending.get(chatId);
  if (entry) {
    clearTimeout(entry.timer);
    entry.texts.push(text);
  }
  const current = entry ?? { texts: [text], leadId, timer: undefined as unknown as NodeJS.Timeout };
  current.timer = setTimeout(() => {
    pending.delete(chatId);
    void answer(current.leadId, current.texts.join("\n"));
  }, DEBOUNCE_MS);
  pending.set(chatId, current);
}

const seen = new Set<string>();
function alreadySeen(id: string | undefined) {
  if (!id) return false;
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > 5000) seen.delete(seen.values().next().value!);
  return false;
}

/** Lets the agent answer a private chat and delivers the reply (GREEN-API, or nothing for a simulated chat). */
export async function answer(leadId: number, text: string) {
  const lead = getLeadRow(leadId);
  if (!lead || lead.bot_paused) return;
  try {
    const { reply } = await runAgentTurn(leadId, text, "WhatsApp");
    if (reply) await deliverToLead(lead, reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[whatsapp] agent failed for lead ${leadId}:`, msg);
    addLeadEvent(leadId, "agent_error", { message: msg });
    if (!(err instanceof AgentNotConfiguredError)) {
      await deliverToLead(lead, "רגע, משהו השתבש אצלי 🙈 נחזור אלייך ממש בקרוב.").catch(() => {});
    }
  }
}

const groupExists = db.prepare<[number], { id: number }>("SELECT id FROM wa_groups WHERE id = ?");

/**
 * Finds or creates the lead for a private chat. A wa.me link with "(#<partyId> g<groupId>)"
 * in the first message tells us which party, and which WhatsApp group, the lead came from.
 */
export function ensureWhatsAppLead(
  chatId: string,
  senderName: string | null,
  firstText: string | null,
  simulated = false,
): LeadRow {
  const existing = findLeadByChatId(chatId);
  if (existing) return existing;
  const code = firstText ? parseEntryCode(firstText) : { partyId: null, groupId: null };
  const sourcePartyId = code.partyId && getParty(code.partyId) ? code.partyId : null;
  const sourceGroupId = code.groupId && groupExists.get(code.groupId) ? code.groupId : null;
  const id = createLead({
    channel: "whatsapp",
    chatId,
    phone: chatId.replace("@c.us", ""),
    waName: senderName,
    sourcePartyId,
    sourceGroupId,
    simulated,
  });
  addLeadEvent(id, "lead_created", { channel: "whatsapp", partyId: sourcePartyId, groupId: sourceGroupId, simulated });
  return getLeadRow(id)!;
}

export async function greenApiWebhook(req: Request, res: Response) {
  if (!tokenOk(req)) {
    res.status(401).json({ error: "bad token" });
    return;
  }
  // Answer GREEN-API at once; the work continues in the background.
  res.json({ ok: true });

  const body = req.body as GreenWebhook;
  const chatId = body.senderData?.chatId;
  if (!chatId || !chatId.endsWith("@c.us")) return; // private chats only: no groups, channels or broadcasts
  if (alreadySeen(body.idMessage)) return;

  const text = extractText(body);

  if (body.typeWebhook === "outgoingMessageReceived") {
    // A person from the team wrote from the phone itself: the bot steps aside for this chat.
    const lead = findLeadByChatId(chatId);
    if (lead && text) {
      appendTranscript(lead.id, { role: "human_agent", text });
      if (!lead.bot_paused) {
        setBotPaused(lead.id, true);
        addLeadEvent(lead.id, "human_took_over", {});
      }
    }
    return;
  }

  if (body.typeWebhook !== "incomingMessageReceived") return;
  if (getSetting("whatsapp_agent_enabled") !== "true") return;

  const lead = ensureWhatsAppLead(chatId, body.senderData?.senderName || body.senderData?.chatName || null, text);

  if (!text) {
    appendTranscript(lead.id, { role: "user", text: `[הודעה מסוג ${body.messageData?.typeMessage ?? "לא ידוע"}]` });
    if (!lead.bot_paused) {
      await deliverToLead(lead, "כרגע אני יכולה לקרוא רק הודעות כתובות 🙏 אפשר לכתוב לי?").catch(() => {});
    }
    return;
  }

  if (lead.bot_paused) {
    appendTranscript(lead.id, { role: "user", text });
    return;
  }
  queueMessage(chatId, lead.id, text);
}
