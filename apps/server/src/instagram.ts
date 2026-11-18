import { db, nowIso, parseJson } from "./db.js";
import { getMediaMany, publicMediaUrl, type MediaRow } from "./media.js";
import { getPostRow, validateForPublishing, type PostRow } from "./posts.js";
import { getSetting } from "./settings.js";

/**
 * Instagram Content Publishing API (Instagram API with Instagram Login by default,
 * host graph.instagram.com; set the host to graph.facebook.com for the Facebook Login variant).
 *
 * Flow: create a media container -> wait until it is FINISHED -> media_publish.
 * Instagram downloads every file from our public /media URL, so PUBLIC_BASE_URL must be reachable.
 */

function igConfig() {
  return {
    token: getSetting("ig_access_token"),
    userId: getSetting("ig_user_id"),
    host: getSetting("ig_graph_host").replace(/\/+$/, ""),
    version: getSetting("ig_api_version"),
  };
}

export function instagramConfigured() {
  const c = igConfig();
  return Boolean(c.token && c.userId);
}

class InstagramError extends Error {}

async function graph<T>(method: "GET" | "POST", pathname: string, params: Record<string, string> = {}): Promise<T> {
  const c = igConfig();
  const url = new URL(`${c.host}/${c.version}/${pathname}`);
  const body = new URLSearchParams({ ...params, access_token: c.token });
  let res: Response;
  if (method === "GET") {
    body.forEach((v, k) => url.searchParams.set(k, v));
    res = await fetch(url);
  } else {
    res = await fetch(url, { method: "POST", body });
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok || json.error) {
    const msg = json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}`;
    throw new InstagramError(msg);
  }
  return json as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntilReady(containerId: string) {
  // Videos need processing time on Instagram's side.
  for (let i = 0; i < 60; i++) {
    const s = await graph<{ status_code?: string; status?: string }>("GET", containerId, {
      fields: "status_code,status",
    });
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new InstagramError(`עיבוד המדיה באינסטגרם נכשל: ${s.status ?? s.status_code}`);
    }
    await sleep(5000);
  }
  throw new InstagramError("עיבוד המדיה באינסטגרם לקח יותר מ-5 דקות");
}

function mediaParams(m: MediaRow): Record<string, string> {
  return m.kind === "image" ? { image_url: publicMediaUrl(m.file_name) } : { video_url: publicMediaUrl(m.file_name) };
}

async function createContainer(post: PostRow, media: MediaRow[]): Promise<string> {
  const { userId } = igConfig();
  const caption = post.caption ?? "";
  if (post.type === "feed") {
    return (await graph<{ id: string }>("POST", `${userId}/media`, { ...mediaParams(media[0]!), caption })).id;
  }
  if (post.type === "reel") {
    return (
      await graph<{ id: string }>("POST", `${userId}/media`, {
        media_type: "REELS",
        video_url: publicMediaUrl(media[0]!.file_name),
        caption,
      })
    ).id;
  }
  if (post.type === "story") {
    return (await graph<{ id: string }>("POST", `${userId}/media`, { media_type: "STORIES", ...mediaParams(media[0]!) }))
      .id;
  }
  // carousel
  const children: string[] = [];
  for (const m of media) {
    const child = await graph<{ id: string }>("POST", `${userId}/media`, {
      ...mediaParams(m),
      ...(m.kind === "video" ? { media_type: "VIDEO" } : {}),
      is_carousel_item: "true",
    });
    if (m.kind === "video") await waitUntilReady(child.id);
    children.push(child.id);
  }
  return (
    await graph<{ id: string }>("POST", `${userId}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
    })
  ).id;
}

async function publishToInstagram(post: PostRow, media: MediaRow[]) {
  const { userId } = igConfig();
  const containerId = await createContainer(post, media);
  await waitUntilReady(containerId);
  const published = await graph<{ id: string }>("POST", `${userId}/media_publish`, { creation_id: containerId });
  let permalink: string | null = null;
  try {
    permalink = (await graph<{ permalink?: string }>("GET", published.id, { fields: "permalink" })).permalink ?? null;
  } catch {
    /* permalink is optional */
  }
  return { mediaId: published.id, permalink };
}

const inFlight = new Set<number>();

/** Publishes one post. Without Instagram credentials it runs a clearly-marked simulation. */
export async function publishPost(postId: number): Promise<void> {
  if (inFlight.has(postId)) return;
  inFlight.add(postId);
  try {
    const post = getPostRow(postId);
    if (!post || post.status === "published") return;
    const media = getMediaMany(parseJson<string[]>(post.media_ids, []));
    const invalid = validateForPublishing(post.type, media);
    if (invalid) {
      db.prepare("UPDATE posts SET status='failed', error=?, updated_at=? WHERE id=?").run(invalid, nowIso(), postId);
      return;
    }
    db.prepare("UPDATE posts SET status='publishing', error=NULL, updated_at=? WHERE id=?").run(nowIso(), postId);

    if (!instagramConfigured()) {
      await sleep(1500);
      db.prepare(
        "UPDATE posts SET status='published', simulated=1, published_at=?, permalink=NULL, updated_at=? WHERE id=?",
      ).run(nowIso(), nowIso(), postId);
      console.log(`[instagram] post ${postId} published in SIMULATION mode (no Instagram credentials)`);
      return;
    }

    try {
      const result = await publishToInstagram(post, media);
      db.prepare(
        "UPDATE posts SET status='published', simulated=0, ig_media_id=?, permalink=?, published_at=?, updated_at=? WHERE id=?",
      ).run(result.mediaId, result.permalink, nowIso(), nowIso(), postId);
      console.log(`[instagram] post ${postId} published as ${result.mediaId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE posts SET status='failed', error=?, updated_at=? WHERE id=?").run(message, nowIso(), postId);
      console.error(`[instagram] post ${postId} failed:`, message);
    }
  } finally {
    inFlight.delete(postId);
  }
}

/** Checks the stored token and returns the account's username. */
export async function testInstagramConnection(): Promise<{ username: string; userId: string }> {
  const c = igConfig();
  if (!c.token) throw new InstagramError("לא הוגדר טוקן גישה");
  if (c.userId) {
    const r = await graph<{ username?: string; id: string }>("GET", c.userId, { fields: "username" });
    return { username: r.username ?? "", userId: c.userId };
  }
  const me = await graph<{ user_id?: string; id: string; username?: string }>("GET", "me", {
    fields: "user_id,username",
  });
  return { username: me.username ?? "", userId: me.user_id ?? me.id };
}

/** Runs every 20 seconds: publishes every scheduled post whose time has come. */
export function startScheduler() {
  // A restart can leave posts stuck in "publishing".
  db.prepare(
    "UPDATE posts SET status='failed', error='הפרסום נקטע בעקבות הפעלה מחדש של השרת. נסו שוב.' WHERE status='publishing'",
  ).run();

  const due = db.prepare<[string], { id: number }>(
    "SELECT id FROM posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 5",
  );
  const tick = () => {
    for (const { id } of due.all(nowIso())) {
      void publishPost(id);
    }
  };
  setInterval(tick, 20_000);
  setTimeout(tick, 3_000);
  console.log(`[instagram] scheduler started (${instagramConfigured() ? "LIVE" : "SIMULATION"} mode)`);
}
