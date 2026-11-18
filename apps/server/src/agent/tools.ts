import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addLeadEvent, getLeadRow, LEAD_STAGES, patchLead } from "../leads.js";
import { getParty, REGIONS, searchParties } from "../parties.js";

type Tool = Anthropic.Beta.BetaTool;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/** Tool definitions. Order and content stay fixed so the prompt cache stays valid. */
export const TOOLS: Tool[] = [
  {
    name: "search_parties",
    description:
      "Search upcoming parties that are on sale. All filters are optional: pass null for a filter you do not want. " +
      "If nothing matches, try again with fewer filters. Returns a short summary of each party.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["genres", "region", "max_price", "date_from", "date_to"],
      properties: {
        genres: nullable({
          type: "array",
          items: { type: "string" },
          description: "Music styles / party categories in Hebrew, for example טראנס, טכנו, האוס",
        }),
        region: nullable({ type: "string", enum: [...REGIONS] }),
        max_price: nullable({ type: "number", description: "Maximum ticket price in ILS" }),
        date_from: nullable({ type: "string", description: "YYYY-MM-DD" }),
        date_to: nullable({ type: "string", description: "YYYY-MM-DD" }),
      },
    },
  },
  {
    name: "get_party_details",
    description: "Full details of one party: description, line-up, ticket tiers, minimum age and notes for sales.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["party_id"],
      properties: { party_id: { type: "integer" } },
    },
  },
  {
    name: "update_lead_profile",
    description:
      "Save what the lead told you about themselves. Pass null for every field you did not learn now. " +
      "Genres are added to the existing list. Call this as soon as you learn something new.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "region",
        "city",
        "genres",
        "budget",
        "age",
        "group_size",
        "preferred_dates",
        "notes",
        "stage",
        "interested_party_id",
      ],
      properties: {
        name: nullable({ type: "string" }),
        region: nullable({ type: "string", enum: [...REGIONS] }),
        city: nullable({ type: "string" }),
        genres: nullable({ type: "array", items: { type: "string" } }),
        budget: nullable({ type: "integer", description: "Max ticket budget in ILS" }),
        age: nullable({ type: "integer" }),
        group_size: nullable({ type: "integer", description: "How many people are coming, including the lead" }),
        preferred_dates: nullable({ type: "string", description: "Free text, for example 'סופי שבוע בדצמבר'" }),
        notes: nullable({ type: "string", description: "Anything else useful for the sales team. Replaces earlier notes." }),
        stage: nullable({ type: "string", enum: ["qualifying", "pitched", "not_interested"] }),
        interested_party_id: nullable({ type: "integer" }),
      },
    },
  },
  {
    name: "send_purchase_link",
    description:
      "Get the ticket purchase link for a party, to include in your reply. Call it when the lead is interested in buying.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["party_id"],
      properties: { party_id: { type: "integer" } },
    },
  },
  {
    name: "request_human",
    description:
      "Hand the conversation to a human from the team. The bot stops replying to this lead until the team resumes it.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["reason"],
      properties: { reason: { type: "string", description: "Short reason, in Hebrew" } },
    },
  },
];

/* ---------------- input validation (strict mode guarantees shape, zod double-checks) ---------------- */

const searchInput = z.object({
  genres: z.array(z.string()).nullable(),
  region: z.string().nullable(),
  max_price: z.number().nullable(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
});
const partyIdInput = z.object({ party_id: z.number().int() });
const profileInput = z.object({
  name: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  genres: z.array(z.string()).nullable(),
  budget: z.number().nullable(),
  age: z.number().nullable(),
  group_size: z.number().nullable(),
  preferred_dates: z.string().nullable(),
  notes: z.string().nullable(),
  stage: z.enum(LEAD_STAGES).nullable(),
  interested_party_id: z.number().int().nullable(),
});
const humanInput = z.object({ reason: z.string() });

const fmtDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("he-IL", {
        timeZone: "Asia/Jerusalem",
        weekday: "long",
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "לא נקבע";

export interface ToolContext {
  leadId: number;
  /** Set when request_human is called, so the caller can stop the bot. */
  handoff?: string;
}

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<string> {
  switch (name) {
    case "search_parties": {
      const q = searchInput.parse(rawInput);
      const { matches, totalUpcoming } = searchParties({
        genres: q.genres,
        region: q.region,
        maxPrice: q.max_price,
        dateFrom: q.date_from,
        dateTo: q.date_to,
      });
      if (!matches.length) {
        return JSON.stringify({
          matches: [],
          note: `No party matches these filters. There are ${totalUpcoming} upcoming parties on sale in total; try fewer filters.`,
        });
      }
      return JSON.stringify({
        matches: matches.slice(0, 8).map((p) => ({
          party_id: p.id,
          name: p.name,
          when: fmtDate(p.startsAt),
          venue: p.venueName,
          city: p.city,
          region: p.region,
          categories: p.categories.map((c) => c.name),
          from_price_ils: p.minPrice,
          min_age: p.minAge,
        })),
      });
    }

    case "get_party_details": {
      const { party_id } = partyIdInput.parse(rawInput);
      const p = getParty(party_id);
      if (!p) return JSON.stringify({ error: "Party not found" });
      return JSON.stringify({
        party_id: p.id,
        name: p.name,
        status: p.status,
        starts: fmtDate(p.startsAt),
        ends: fmtDate(p.endsAt),
        venue: p.venueName,
        address: p.address,
        city: p.city,
        region: p.region,
        categories: p.categories.map((c) => c.name),
        line_up: p.lineup,
        description: p.description,
        min_age: p.minAge,
        ticket_tiers: p.ticketTiers.map((t) => ({ name: t.name, price_ils: t.price })),
        notes_for_sales: p.agentNotes,
        has_ticket_link: Boolean(p.ticketUrl),
      });
    }

    case "update_lead_profile": {
      const input = profileInput.parse(rawInput);
      patchLead(ctx.leadId, {
        name: input.name,
        region: input.region,
        city: input.city,
        genres: input.genres,
        budget: input.budget,
        age: input.age,
        group_size: input.group_size,
        preferred_dates: input.preferred_dates,
        notes: input.notes,
        stage: input.stage,
        interested_party_id: input.interested_party_id,
      });
      const lead = getLeadRow(ctx.leadId);
      if (lead && lead.stage === "new" && !input.stage) patchLead(ctx.leadId, { stage: "qualifying" });
      const learned = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null));
      addLeadEvent(ctx.leadId, "profile_updated", learned);
      return JSON.stringify({ ok: true });
    }

    case "send_purchase_link": {
      const { party_id } = partyIdInput.parse(rawInput);
      const p = getParty(party_id);
      if (!p) return JSON.stringify({ error: "Party not found" });
      if (p.status !== "on_sale") return JSON.stringify({ error: `Tickets are not on sale (status: ${p.status})` });
      if (!p.ticketUrl) {
        return JSON.stringify({ error: "This party has no ticket link yet. Tell the lead the team will send it soon." });
      }
      patchLead(ctx.leadId, { stage: "link_sent", interested_party_id: p.id });
      addLeadEvent(ctx.leadId, "link_sent", { partyId: p.id, partyName: p.name, url: p.ticketUrl });
      return JSON.stringify({ url: p.ticketUrl, party: p.name });
    }

    case "request_human": {
      const { reason } = humanInput.parse(rawInput);
      ctx.handoff = reason;
      patchLead(ctx.leadId, { stage: "needs_human" });
      addLeadEvent(ctx.leadId, "handoff", { reason });
      return JSON.stringify({ ok: true, note: "A human will take over. Tell the lead someone from the team will reply soon." });
    }

    default:
      return JSON.stringify({ error: `Unknown tool ${name}` });
  }
}
