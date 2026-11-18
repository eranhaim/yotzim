import { config } from "../config.js";
import type { LeadRow } from "../leads.js";
import { getSetting } from "../settings.js";
import { greenApiConfigured, sendText } from "./greenapi.js";

/** Placeholder number for simulation mode, when no business number is set. */
const SIMULATION_NUMBER = "972500000000";

/** True when messages really go out through GREEN-API. Otherwise the number lives inside the app. */
export function whatsappLive() {
  return getSetting("whatsapp_mode") === "greenapi" && greenApiConfigured();
}

/** The business number, digits only. */
export function businessNumber() {
  return getSetting("whatsapp_business_number").replace(/\D/g, "") || SIMULATION_NUMBER;
}

/** wa.me link that opens a private chat with the business, with an entry code for the party and group. */
export function waMeLink(partyId: number, partyName: string, groupId?: number | null) {
  return `https://wa.me/${businessNumber()}?text=${encodeURIComponent(entryText(partyId, partyName, groupId))}`;
}

/** Short link for group messages: /go/<party>/<group> redirects to the wa.me link (see index.ts). */
export function entryLink(partyId: number, partyName: string, groupId?: number | null) {
  return groupId ? `${config.publicBaseUrl}/go/${partyId}/${groupId}` : waMeLink(partyId, partyName, groupId);
}

export function entryText(partyId: number, partyName: string, groupId?: number | null) {
  const name = partyName.replace(/^\[[^\]]*\]\s*/, "");
  return `היי! ראיתי את "${name}" ואשמח לפרטים 🙌 (#${partyId}${groupId ? ` g${groupId}` : ""})`;
}

/** Reads "(#12)" or "(#12 g3)" from the first message of a chat. */
export function parseEntryCode(text: string): { partyId: number | null; groupId: number | null } {
  const m = text.match(/\(#(\d{1,7})(?:\s*g(\d{1,7}))?\)/);
  return { partyId: m ? Number(m[1]) : null, groupId: m?.[2] ? Number(m[2]) : null };
}

/** Sends a private message to a lead. Simulated leads only keep the message in the transcript. */
export async function deliverToLead(lead: Pick<LeadRow, "channel" | "chat_id" | "simulated">, text: string) {
  if (lead.channel !== "whatsapp" || lead.simulated || !lead.chat_id) return;
  await sendText(lead.chat_id, text);
}
