import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { db } from "../db.js";
import { appendTranscript, getConversation, getLeadRow, saveApiMessages, setBotPaused, toLeadDto } from "../leads.js";
import { getParty } from "../parties.js";
import { buildSystemPrompt } from "./prompt.js";
import { runTool, TOOLS, type ToolContext } from "./tools.js";

type MessageParam = Anthropic.Beta.BetaMessageParam;

let client: Anthropic | null = null;
export function getClient() {
  client ??= new Anthropic();
  return client;
}

export function agentConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export class AgentNotConfiguredError extends Error {
  constructor() {
    super("לא הוגדר מפתח ANTHROPIC_API_KEY בשרת, ולכן הסוכן לא יכול לענות.");
  }
}

/* One turn at a time per lead: WhatsApp messages can arrive while the agent is still answering. */
const locks = new Map<number, Promise<unknown>>();
function withLeadLock<T>(leadId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(leadId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(leadId, next);
  void next.finally(() => {
    if (locks.get(leadId) === next) locks.delete(leadId);
  });
  return next;
}

function israelNow() {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: config.timezone,
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

/** Per-turn facts. Sent as a mid-conversation system message so the cached prefix stays valid. */
function turnContext(leadId: number, isFirstTurn: boolean, channel: string): string {
  const lead = getLeadRow(leadId);
  const lines = [`Current date and time in Israel: ${israelNow()}.`, `Channel: ${channel}.`];
  if (lead) {
    const dto = toLeadDto(lead);
    const known = {
      name: dto.name ?? dto.waName,
      region: dto.region,
      city: dto.city,
      genres: dto.genres.length ? dto.genres : null,
      budget: dto.budget,
      age: dto.age,
      group_size: dto.groupSize,
      preferred_dates: dto.preferredDates,
      stage: dto.stage,
    };
    lines.push(`What we already know about the lead: ${JSON.stringify(known)}`);
    if (isFirstTurn && lead.source_party_id) {
      const p = getParty(lead.source_party_id);
      if (p) {
        lines.push(
          `This lead started the conversation from the post/ad of the party "${p.name}" (party_id ${p.id}). ` +
            `Open with this party, but check that it fits them before you push it.`,
        );
      }
    }
    if (isFirstTurn && lead.source_group_id) {
      const g = db
        .prepare<[number], { name: string; region: string | null; description: string | null }>(
          "SELECT name, region, description FROM wa_groups WHERE id = ?",
        )
        .get(lead.source_group_id);
      if (g) {
        lines.push(
          `The lead clicked the link in an announcement in the company's WhatsApp group "${g.name}"` +
            `${g.region ? ` (a group for the ${g.region} area)` : ""}${g.description ? `. About the group: ${g.description}` : ""}.`,
        );
      }
    }
  }
  return lines.join("\n");
}

const MAX_STEPS = 8;

export interface AgentTurnResult {
  reply: string;
  handoff: string | null;
}

/**
 * Runs one agent turn: appends the lead's message, lets Claude call tools until it
 * answers, stores the full API history (append-only) and the readable transcript.
 */
export function runAgentTurn(leadId: number, userText: string, channel: "WhatsApp" | "simulation"): Promise<AgentTurnResult> {
  return withLeadLock(leadId, async () => {
    if (!agentConfigured()) throw new AgentNotConfiguredError();

    const { apiMessages } = getConversation(leadId);
    const base = apiMessages as MessageParam[];
    const isFirstTurn = base.length === 0;

    const userMsg: MessageParam = { role: "user", content: userText };
    const messages: MessageParam[] = [
      ...base,
      userMsg,
      { role: "system", content: turnContext(leadId, isFirstTurn, channel) },
    ];
    appendTranscript(leadId, { role: "user", text: userText });

    const ctx: ToolContext = { leadId };
    const replyParts: string[] = [];

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const response = await getClient().beta.messages.create({
          model: config.anthropicModel,
          max_tokens: 16000,
          system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          messages,
          output_config: { effort: config.agentEffort },
          cache_control: { type: "ephemeral" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });

        messages.push({ role: "assistant", content: response.content });
        for (const block of response.content) {
          if (block.type === "text" && block.text.trim()) replyParts.push(block.text.trim());
        }

        if (response.stop_reason === "refusal") {
          replyParts.length = 0;
          replyParts.push("סליחה, בזה אני לא יכולה לעזור 🙏 מישהו מהצוות יחזור אלייך.");
          break;
        }
        if (response.stop_reason === "pause_turn") continue;
        if (response.stop_reason !== "tool_use") break;

        const toolUses = response.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
        );
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          try {
            results.push({ type: "tool_result", tool_use_id: tu.id, content: await runTool(tu.name, tu.input, ctx) });
          } catch (err) {
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              is_error: true,
              content: err instanceof Error ? err.message : String(err),
            });
          }
        }
        messages.push({ role: "user", content: results });
      }
    } catch (err) {
      // Keep the lead's message in history (without this turn's partial steps), then report.
      saveApiMessages(leadId, [...base, userMsg]);
      throw err;
    }

    saveApiMessages(leadId, messages);

    const reply = replyParts.join("\n\n").replace(/\*\*(.+?)\*\*/g, "*$1*");
    if (reply) appendTranscript(leadId, { role: "assistant", text: reply });
    if (ctx.handoff) {
      setBotPaused(leadId, true);
      appendTranscript(leadId, { role: "system", text: `השיחה הועברה לנציג: ${ctx.handoff}` });
    }
    return { reply, handoff: ctx.handoff ?? null };
  });
}
