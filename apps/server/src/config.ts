import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (apps/server/src or apps/server/dist -> ../../..). */
export const REPO_ROOT = path.resolve(here, "../../..");

function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const config = {
  port: Number(env("PORT", "3000")),
  /** Public HTTPS base URL. Instagram downloads media from here, so it must be reachable from the internet. */
  publicBaseUrl: env("PUBLIC_BASE_URL", "http://localhost:3000").replace(/\/+$/, ""),
  dataDir: path.resolve(env("DATA_DIR", path.join(REPO_ROOT, "data"))),
  webDistDir: path.resolve(env("WEB_DIST_DIR", path.join(REPO_ROOT, "apps/backoffice/dist"))),

  adminPassword: env("ADMIN_PASSWORD", "yotzim"),
  sessionSecret: env("SESSION_SECRET", "dev-only-secret-change-me"),

  anthropicModel: env("AGENT_MODEL", "claude-opus-5-5"),
  agentEffort: env("AGENT_EFFORT", "low") as "low" | "medium" | "high" | "xhigh" | "max",

  seedDemoData: env("SEED_DEMO_DATA", "true") === "true",
  timezone: "Asia/Jerusalem",
};

export const isProduction = process.env.NODE_ENV === "production";
