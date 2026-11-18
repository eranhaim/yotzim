import crypto from "node:crypto";
import { db } from "./db.js";

/**
 * Runtime settings, editable from the back office. A value saved in the
 * database wins; otherwise the environment variable is used; otherwise the default.
 */
export const SETTING_DEFS = {
  company_name: { env: "COMPANY_NAME", default: "יוצאים", secret: false },
  agent_name: { env: "AGENT_NAME", default: "נוי", secret: false },
  agent_extra_instructions: { env: "", default: "", secret: false },
  whatsapp_business_number: { env: "WHATSAPP_BUSINESS_NUMBER", default: "", secret: false },

  ig_access_token: { env: "IG_ACCESS_TOKEN", default: "", secret: true },
  ig_user_id: { env: "IG_USER_ID", default: "", secret: false },
  ig_graph_host: { env: "IG_GRAPH_HOST", default: "https://graph.instagram.com", secret: false },
  ig_api_version: { env: "IG_API_VERSION", default: "v23.0", secret: false },

  /** "simulation": the number lives inside the app. "greenapi": a real phone through GREEN-API. */
  whatsapp_mode: { env: "WHATSAPP_MODE", default: "simulation", secret: false },
  greenapi_api_url: { env: "GREENAPI_API_URL", default: "https://api.green-api.com", secret: false },
  greenapi_id_instance: { env: "GREENAPI_ID_INSTANCE", default: "", secret: false },
  greenapi_api_token: { env: "GREENAPI_API_TOKEN", default: "", secret: true },
  greenapi_webhook_token: { env: "GREENAPI_WEBHOOK_TOKEN", default: "", secret: true },
  whatsapp_agent_enabled: { env: "WHATSAPP_AGENT_ENABLED", default: "true", secret: false },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;

const getStmt = db.prepare<[string], { value: string }>("SELECT value FROM settings WHERE key = ?");
const setStmt = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);

export function getSetting(key: SettingKey): string {
  const row = getStmt.get(key);
  if (row) return row.value;
  const def = SETTING_DEFS[key];
  if (def.env && process.env[def.env]) return process.env[def.env]!;
  return def.default;
}

export function setSetting(key: SettingKey, value: string) {
  setStmt.run(key, value);
}

/** Returns a webhook token, creating a random one on first use. */
export function ensureWebhookToken(): string {
  let token = getSetting("greenapi_webhook_token");
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    setSetting("greenapi_webhook_token", token);
  }
  return token;
}

function mask(value: string) {
  if (!value) return "";
  return value.length <= 8 ? "••••" : `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/** All settings for the UI; secrets are masked. */
export function publicSettings() {
  const out: Record<string, string | boolean> = {};
  for (const key of Object.keys(SETTING_DEFS) as SettingKey[]) {
    const def = SETTING_DEFS[key];
    const value = getSetting(key);
    if (def.secret) {
      out[key] = mask(value);
      out[`${key}_set`] = Boolean(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
