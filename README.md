# Yotzim (יוצאים) platform

Back office, Instagram post scheduler and WhatsApp AI sales agent for Yotzim, a party promotion company.

| Part | Where | What it does |
|---|---|---|
| Back office | `apps/backoffice` (React + Vite + Mantine, Hebrew RTL) | Parties, categories, Go-Out import, Instagram posting calendar, leads and conversations, settings |
| Server | `apps/server` (Node + Express + SQLite) | REST API, media hosting, Instagram scheduler, WhatsApp webhook |
| Sales agent | `apps/server/src/agent` | Claude with tools: search parties, read details, record the lead profile, send the Go-Out purchase link, hand off to a human |
| WhatsApp | `apps/server/src/whatsapp` | GREEN-API client and webhook (debounced, private chats only) |

## How it works

- **Source of truth:** every party lives in SQLite (`data/yotzim.db`): dates, venue, region, categories, ticket tiers, Go-Out link, cover, notes for the agent.
- **Go-Out import:** paste an event link; the server reads the page's schema.org data (name, dates, address, tiers, cover).
- **Instagram scheduler:** posts (feed / carousel / reel / story) are queued with a time. Every 20 seconds the server publishes the posts that are due, through the Instagram Content Publishing API (container → status check → `media_publish`). Without Instagram credentials the scheduler runs in **simulation mode** and marks posts as published without uploading.
- **Sales agent:** the same agent serves real WhatsApp chats and the simulation chat on each party page. It stores the full API history per lead, plus a readable transcript and an event log (profile updated, link sent, handoff).
- **WhatsApp entry links:** each party page offers a `wa.me` link with `(#<partyId>)` in the text. When a lead opens the chat from that link, the agent starts from that party.
- **Human takeover:** a message sent from the business phone itself, or from the leads page, pauses the bot for that lead.
- **WhatsApp number page (`/whatsapp`):** the business number as a card, the groups and communities connected to it, the announcements sent to each group, and the private chats the agent handles.
  - **Simulation mode** (default, `WHATSAPP_MODE=simulation`): the number lives inside the app. Group messages and replies are stored, not sent. "Simulate a member click" creates a contact who opens a private chat from the link in a group message; you can then write as the customer or as staff. The same intake code as the real webhook runs (lead creation, entry codes, agent, handoff).
  - **GREEN-API mode** (`whatsapp_mode=greenapi` in Settings, with credentials): group messages go to each group's `chat_id` (`…@g.us`), and replies go to real chats.
  - **Group announcements:** a ready text from the party details, or one written by Claude. `{{קישור}}` becomes a short link per group, `/go/<partyId>/<groupId>`, which redirects to `wa.me` with the code `(#<partyId> g<groupId>)`. The lead then records which party and which group it came from. Announcements can be sent now or scheduled (the scheduler runs every 20 seconds).

## Local development

```bash
npm install
cp .env.example .env        # set ANTHROPIC_API_KEY at least
npm run dev:server          # http://localhost:3000
npm run dev:web             # http://localhost:5173 (proxies /api to the server)
```

Default password: `yotzim` (set `ADMIN_PASSWORD`).

## Deploy (Vultr box)

The app runs as one Docker container behind the host's Caddy.

```bash
# first time, on the server
git clone https://github.com/eranhaim/yotzim.git /home/deploy/projects/yotzim
cd /home/deploy/projects/yotzim
cp .env.example .env && nano .env
sudo -u deploy docker compose up -d --build
# add deploy/Caddyfile.snippet to /etc/caddy/Caddyfile, then: caddy validate && systemctl reload caddy

# every update
sudo -u deploy sh deploy/deploy.sh   # the repo folder belongs to the deploy user
```

Data (SQLite + uploaded media) is in the `yotzim_data` Docker volume.

## Connecting the real accounts

- **Instagram:** a Business or Creator account and a Meta app with `instagram_business_content_publish`. Paste a long-lived token in Settings → Instagram and press "test". Media must be reachable at `PUBLIC_BASE_URL`.
- **WhatsApp (GREEN-API):** create an instance, scan the QR with the business phone, paste `idInstance` and `apiTokenInstance` in Settings, then press "connect webhook". GREEN-API is not an official Meta API, so the number can be blocked if it sends bulk messages; the agent only replies to people who wrote first.
- **Claude:** set `ANTHROPIC_API_KEY` in `.env`.
