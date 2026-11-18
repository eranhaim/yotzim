import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { agentConfigured } from "./agent/agent.js";
import { isAuthed, login, logout, requireAuth } from "./auth.js";
import { config, isProduction } from "./config.js";
import { startScheduler } from "./instagram.js";
import { MEDIA_DIR } from "./media.js";
import { api, errorHandler } from "./routes.js";
import { seedDemoData } from "./seed.js";
import { greenApiWebhook } from "./whatsapp/webhook.js";

if (isProduction && (config.adminPassword === "yotzim" || config.sessionSecret.startsWith("dev-only"))) {
  console.warn("[security] ADMIN_PASSWORD / SESSION_SECRET use default values. Set them in .env.");
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Media must be public: Instagram's servers download scheduled files from here.
app.use("/media", express.static(MEDIA_DIR, { maxAge: "7d", index: false }));

app.post("/webhooks/greenapi", greenApiWebhook);

app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);
app.get("/api/auth/me", (req, res) => res.json({ authed: isAuthed(req) }));
app.use("/api", requireAuth, api);
app.use("/api", errorHandler);

// The back office (built React app), with SPA fallback.
if (fs.existsSync(config.webDistDir)) {
  app.use(express.static(config.webDistDir, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/(api|media|webhooks)\/).*/, (_req, res) => {
    res.sendFile(path.join(config.webDistDir, "index.html"));
  });
}

await (config.seedDemoData ? seedDemoData() : Promise.resolve());
startScheduler();

app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port} (public URL ${config.publicBaseUrl})`);
  console.log(`[agent] ${agentConfigured() ? `ready, model ${config.anthropicModel}` : "NOT configured (set ANTHROPIC_API_KEY)"}`);
});
