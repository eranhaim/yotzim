import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, "yotzim.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/** Ordered schema migrations. Never edit an applied entry; append a new one. */
const migrations: string[] = [
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'grape'
  );

  CREATE TABLE media (
    id            TEXT PRIMARY KEY,
    file_name     TEXT NOT NULL,
    original_name TEXT,
    mime          TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('image','video')),
    size          INTEGER NOT NULL,
    width         INTEGER,
    height        INTEGER,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE parties (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','on_sale','sold_out','cancelled')),
    starts_at      TEXT,
    ends_at        TEXT,
    venue_name     TEXT,
    address        TEXT,
    city           TEXT,
    region         TEXT,
    description    TEXT,
    lineup         TEXT,
    agent_notes    TEXT,
    min_age        INTEGER,
    ticket_url     TEXT,
    ticket_tiers   TEXT NOT NULL DEFAULT '[]',
    cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE party_categories (
    party_id    INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (party_id, category_id)
  );

  CREATE TABLE posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id        INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    type            TEXT NOT NULL CHECK (type IN ('feed','carousel','reel','story')),
    caption         TEXT NOT NULL DEFAULT '',
    media_ids       TEXT NOT NULL DEFAULT '[]',
    scheduled_at    TEXT,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','publishing','published','failed')),
    ig_media_id     TEXT,
    permalink       TEXT,
    error           TEXT,
    simulated       INTEGER NOT NULL DEFAULT 0,
    published_at    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX posts_due ON posts (status, scheduled_at);

  CREATE TABLE leads (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    channel             TEXT NOT NULL CHECK (channel IN ('whatsapp','simulation')),
    chat_id             TEXT UNIQUE,
    phone               TEXT,
    wa_name             TEXT,
    name                TEXT,
    region              TEXT,
    city                TEXT,
    genres              TEXT NOT NULL DEFAULT '[]',
    budget              INTEGER,
    age                 INTEGER,
    group_size          INTEGER,
    preferred_dates     TEXT,
    notes               TEXT,
    stage               TEXT NOT NULL DEFAULT 'new',
    interested_party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    source_party_id     INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    bot_paused          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    last_message_at     TEXT
  );

  CREATE TABLE conversations (
    lead_id      INTEGER PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
    api_messages TEXT NOT NULL DEFAULT '[]',
    transcript   TEXT NOT NULL DEFAULT '[]',
    updated_at   TEXT NOT NULL
  );

  CREATE TABLE lead_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX lead_events_lead ON lead_events (lead_id, id);
  `,
];

function migrate() {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
migrate();

export const nowIso = () => new Date().toISOString();

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
