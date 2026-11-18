import { getSetting } from "../settings.js";

/**
 * Minimal GREEN-API client (https://green-api.com/en/docs/).
 * URL shape: {apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}
 */

function creds() {
  return {
    apiUrl: getSetting("greenapi_api_url").replace(/\/+$/, ""),
    idInstance: getSetting("greenapi_id_instance"),
    token: getSetting("greenapi_api_token"),
  };
}

export function greenApiConfigured() {
  const c = creds();
  return Boolean(c.idInstance && c.token);
}

async function call<T>(method: string, httpMethod: "GET" | "POST", body?: unknown): Promise<T> {
  const c = creds();
  if (!c.idInstance || !c.token) throw new Error("GREEN-API לא מוגדר (חסר idInstance או apiTokenInstance)");
  const res = await fetch(`${c.apiUrl}/waInstance${c.idInstance}/${method}/${c.token}`, {
    method: httpMethod,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GREEN-API ${method} נכשל: HTTP ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export function sendText(chatId: string, message: string) {
  return call<{ idMessage: string }>("sendMessage", "POST", { chatId, message, linkPreview: true });
}

export function getState() {
  return call<{ stateInstance: string }>("getStateInstance", "GET");
}

export function getInstanceSettings() {
  return call<{ wid?: string; webhookUrl?: string; incomingWebhook?: string }>("getSettings", "GET");
}

/** Points the instance's webhooks at this server. */
export function setWebhook(webhookUrl: string, webhookUrlToken: string) {
  return call<{ saveSettings: boolean }>("setSettings", "POST", {
    webhookUrl,
    webhookUrlToken,
    incomingWebhook: "yes",
    outgoingMessageWebhook: "yes",
    outgoingAPIMessageWebhook: "no",
    outgoingWebhook: "no",
    stateWebhook: "no",
  });
}

/** Sends a picture or video by public URL, with an optional caption. */
export function sendFileByUrl(chatId: string, urlFile: string, fileName: string, caption?: string) {
  return call<{ idMessage: string }>("sendFileByUrl", "POST", { chatId, urlFile, fileName, caption });
}
