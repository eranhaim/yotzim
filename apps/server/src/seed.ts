import sharp from "sharp";
import { db } from "./db.js";
import { saveImage } from "./media.js";
import { createCategory, createParty, getParty, listCategories } from "./parties.js";
import { createPost } from "./posts.js";
import { announcementTemplate, broadcast, createGroup } from "./whatsapp/groups.js";

/**
 * Demo content for the sales meeting: categories, sample parties and a posting schedule.
 * Runs only when the database has no parties. The sample parties are marked [דוגמה].
 */

const CATEGORIES: [string, string][] = [
  ["טראנס", "violet"],
  ["טראנס טבע", "green"],
  ["טכנו", "dark"],
  ["האוס", "orange"],
  ["מסיבת חוף", "cyan"],
  ["היפ הופ", "yellow"],
  ["מזרחית", "red"],
  ["שנות ה-2000", "pink"],
  ["רייב", "indigo"],
];

/** Abstract gradient artwork (no text, so no fonts are needed on the server). */
async function artwork(from: string, to: string, shape: "sun" | "rings" | "waves", w = 1080, h = 1350) {
  const shapes = {
    sun: `<circle cx="${w / 2}" cy="${h * 0.45}" r="${w * 0.28}" fill="#fff" fill-opacity="0.22"/>
          <circle cx="${w / 2}" cy="${h * 0.45}" r="${w * 0.18}" fill="#fff" fill-opacity="0.25"/>`,
    rings: [0.15, 0.25, 0.35, 0.45]
      .map((r) => `<circle cx="${w / 2}" cy="${h / 2}" r="${w * r}" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="10"/>`)
      .join(""),
    waves: [0.55, 0.65, 0.75]
      .map(
        (y, i) =>
          `<path d="M0 ${h * y} Q ${w / 4} ${h * y - 80} ${w / 2} ${h * y} T ${w} ${h * y} V ${h} H 0 Z" fill="#fff" fill-opacity="${0.1 + i * 0.05}"/>`,
      )
      .join(""),
  }[shape];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${shapes}</svg>`;
  return saveImage(await sharp(Buffer.from(svg)).jpeg().toBuffer(), null);
}

/** A date N days from today, at a given Israel-time hour. */
function daysFromNow(days: number, hour: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  // Israel is UTC+2 in winter (UTC+3 in summer); good enough for demo data.
  d.setUTCHours(hour - 2, minute, 0, 0);
  return d.toISOString();
}

export async function seedDemoData() {
  const count = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM parties").get()!.n;
  if (count > 0) return;
  console.log("[seed] creating demo data");

  if (listCategories().length === 0) for (const [name, color] of CATEGORIES) createCategory(name, color);
  const cat = Object.fromEntries(listCategories().map((c) => [c.name, c.id]));

  // The real Yotzim event page on Go-Out, used as a placeholder ticket link for the sample parties.
  const demoTicketUrl = "https://go-out.co/event/1794146321096";

  const parties = [
    {
      name: "[דוגמה] NATURE TRANCE · יער בירייה",
      cats: ["טראנס טבע", "טראנס"],
      art: await artwork("#0f5132", "#7cc576", "sun"),
      starts: daysFromNow(15, 22),
      ends: daysFromNow(16, 12),
      venue: "יער בירייה",
      city: "צפת",
      region: "צפון",
      tiers: [
        { name: "מוקדמים", price: 140 },
        { name: "שלב ב'", price: 170 },
        { name: "בכניסה", price: 200 },
      ],
      lineup: "Forest Mind, Moon Echo, Shaked B",
      minAge: 18,
      description: "מסיבת טבע של 14 שעות בלב היער, עם מערכת סאונד ענקית, שוק אוכל טבעוני ואזור צ'יל.",
      notes: "יש הסעות מתל אביב ומחיפה ב-50₪ (מסומן בעמוד הכרטיסים). מומלץ להביא שק שינה ובגדים חמים, בלילה קר. חניה חינם.",
    },
    {
      name: "[דוגמה] TECHNO WAREHOUSE · דרום תל אביב",
      cats: ["טכנו", "רייב"],
      art: await artwork("#111111", "#5f3dc4", "rings"),
      starts: daysFromNow(9, 23, 30),
      ends: daysFromNow(10, 7),
      venue: "מחסן 7, דרום תל אביב",
      city: "תל אביב",
      region: "תל אביב",
      tiers: [
        { name: "מוקדמים", price: 110 },
        { name: "רגיל", price: 140 },
      ],
      lineup: "Nightshift, Dana K, Low Frequency",
      minAge: 21,
      description: "לילה של טכנו אינדסטריאלי במחסן ענק, תאורת לייזר והפקה מלאה.",
      notes: "21+ בלבד, יש בדיקת תעודות בכניסה. קרוב לרכבת ההגנה.",
    },
    {
      name: "[דוגמה] SUNSET BEACH HOUSE · הרצליה",
      cats: ["האוס", "מסיבת חוף"],
      art: await artwork("#f76707", "#ffd43b", "waves"),
      starts: daysFromNow(6, 16),
      ends: daysFromNow(6, 23),
      venue: "חוף הצוק",
      city: "הרצליה",
      region: "שרון",
      tiers: [
        { name: "כרטיס", price: 90 },
        { name: "VIP כולל משקה", price: 160 },
      ],
      lineup: "Sunset Collective, Yarden M, Coastline",
      minAge: 18,
      description: "מסיבת שקיעה על החול, האוס מלודי עד הלילה. בר קוקטיילים על החוף.",
      notes: "האירוע מתחיל מוקדם - מומלץ להגיע לשקיעה (17:00). אפשר להגיע בבגד ים.",
    },
    {
      name: "[דוגמה] מזרחית על האש · ירושלים",
      cats: ["מזרחית"],
      art: await artwork("#c92a2a", "#fab005", "sun"),
      starts: daysFromNow(20, 22, 30),
      ends: daysFromNow(21, 4),
      venue: "התחנה הראשונה",
      city: "ירושלים",
      region: "ירושלים",
      tiers: [
        { name: "מוקדמים", price: 99 },
        { name: "רגיל", price: 129 },
      ],
      lineup: "להקת הבית + DJ מזרחית",
      minAge: 18,
      description: "המסיבה הכי שמחה בעיר: מזרחית, ים תיכוני ולהיטים, עם שולחנות אוכל.",
      notes: "אפשר להזמין שולחן לקבוצות של 6 ומעלה דרך הצוות.",
    },
    {
      name: "[דוגמה] 2000s THROWBACK · חיפה",
      cats: ["שנות ה-2000", "היפ הופ"],
      art: await artwork("#d6336c", "#4dabf7", "rings"),
      starts: daysFromNow(11, 23),
      ends: daysFromNow(12, 5),
      venue: "מועדון הפורט",
      city: "חיפה",
      region: "חיפה והקריות",
      tiers: [{ name: "כרטיס", price: 80 }],
      lineup: "DJ Retro, DJ Tali B",
      minAge: 18,
      description: "כל הלהיטים של שנות ה-2000: היפ הופ, R&B ופופ. קוד לבוש: נוסטלגיה.",
      notes: "בכניסה עד 00:00 - צ'ייסר מתנה.",
    },
    {
      name: "[דוגמה] DESERT TRANCE · מכתש רמון",
      cats: ["טראנס טבע", "טראנס"],
      art: await artwork("#e8590c", "#862e9c", "sun"),
      starts: daysFromNow(30, 21),
      ends: daysFromNow(31, 14),
      venue: "מכתש רמון",
      city: "מצפה רמון",
      region: "דרום",
      tiers: [
        { name: "מוקדמים", price: 190 },
        { name: "רגיל", price: 230 },
      ],
      lineup: "Desert Owl, Psy Nomad, Orbit 9",
      minAge: 18,
      description: "זריחה במדבר עם הליין-אפ הכי חזק של העונה. קמפינג בשטח.",
      notes: "יש אפשרות לכרטיס קמפינג (בעמוד הכרטיסים). הסעות מתל אביב ובאר שבע.",
    },
  ];

  const ids: number[] = [];
  for (const p of parties) {
    ids.push(
      createParty({
        name: p.name,
        status: "on_sale",
        startsAt: p.starts,
        endsAt: p.ends,
        venueName: p.venue,
        address: null,
        city: p.city,
        region: p.region,
        description: p.description,
        lineup: p.lineup,
        agentNotes: p.notes,
        minAge: p.minAge,
        ticketUrl: demoTicketUrl,
        ticketTiers: p.tiers,
        coverMediaId: p.art.id,
        categoryIds: p.cats.map((c) => cat[c]!).filter(Boolean),
      }),
    );
  }

  // A posting schedule: announcement, reminder story, last-call post.
  const extra = [
    await artwork("#0f5132", "#7cc576", "waves"),
    await artwork("#111111", "#5f3dc4", "waves"),
    await artwork("#f76707", "#ffd43b", "rings"),
  ];
  const schedule: { party: number; type: "feed" | "story" | "carousel"; day: number; hour: number; caption: string; media: string[] }[] = [
    { party: 0, type: "feed", day: 1, hour: 19, caption: "🌲 NATURE TRANCE חוזרת ליער בירייה! 14 שעות של טראנס טבע. כרטיסים מוקדמים בלינק בביו 🎟️", media: [parties[0]!.art.id] },
    { party: 0, type: "story", day: 8, hour: 20, caption: "", media: [extra[0]!.id] },
    { party: 0, type: "carousel", day: 13, hour: 18, caption: "הליין-אפ המלא 🔥 נשארו כרטיסים אחרונים בשלב ב'", media: [parties[0]!.art.id, extra[0]!.id] },
    { party: 1, type: "feed", day: 2, hour: 21, caption: "TECHNO WAREHOUSE ⚡ לילה אחד, מחסן אחד, בלי הפסקות. 21+", media: [parties[1]!.art.id] },
    { party: 1, type: "story", day: 8, hour: 22, caption: "", media: [extra[1]!.id] },
    { party: 2, type: "feed", day: 0, hour: 20, caption: "🌅 SUNSET BEACH HOUSE בשבת הקרובה בחוף הצוק. מי בא?", media: [parties[2]!.art.id] },
    { party: 2, type: "story", day: 5, hour: 12, caption: "", media: [extra[2]!.id] },
    { party: 4, type: "feed", day: 4, hour: 19, caption: "חוזרים לשנות ה-2000 📼 THROWBACK בחיפה", media: [parties[4]!.art.id] },
    { party: 5, type: "feed", day: 10, hour: 19, caption: "🏜️ DESERT TRANCE במכתש רמון. זריחה שלא תשכחו.", media: [parties[5]!.art.id] },
  ];
  for (const s of schedule) {
    createPost({
      partyId: ids[s.party]!,
      type: s.type,
      caption: s.caption,
      mediaIds: s.media,
      scheduledAt: daysFromNow(s.day, s.hour),
      status: "scheduled",
    });
  }

  // Two posts that already went out (shown as published in the calendar).
  const pastIds = [
    createPost({ partyId: ids[0]!, type: "feed", caption: "Save the date 🌲", mediaIds: [parties[0]!.art.id], scheduledAt: daysFromNow(-3, 19), status: "scheduled" }),
    createPost({ partyId: ids[2]!, type: "story", caption: "", mediaIds: [parties[2]!.art.id], scheduledAt: daysFromNow(-1, 13), status: "scheduled" }),
  ];
  for (const id of pastIds) {
    db.prepare("UPDATE posts SET status='published', simulated=1, published_at=scheduled_at WHERE id=?").run(id);
  }
}

/**
 * Demo WhatsApp groups for the simulated number, plus a few announcements.
 * Runs only when there are no groups. Groups are capped at 1,024 members, like real WhatsApp groups.
 */
export async function seedWhatsAppGroups() {
  const count = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM wa_groups").get()!.n;
  if (count > 0) return;
  console.log("[seed] creating demo WhatsApp groups");
  const cat = Object.fromEntries(listCategories().map((c) => [c.name, c.id]));
  const ids = (names: string[]) => names.map((n) => cat[n]).filter((x): x is number => typeof x === "number");

  const community = createGroup({
    name: "קהילת יוצאים 🎉",
    kind: "community",
    parentId: null,
    chatId: null,
    members: 0,
    region: null,
    description: "הקהילה הראשית: כל הקבוצות לפי סגנון ואזור, וקבוצת עדכונים לכולם.",
    categoryIds: [],
  });
  const groups: [string, number, string | null, string[], string][] = [
    ["יוצאים · טראנס וטבע 🌲", 1024, null, ["טראנס", "טראנס טבע"], "מסיבות טראנס, טבע ושקיעות."],
    ["יוצאים · טכנו ורייב ⚡", 987, null, ["טכנו", "רייב"], "טכנו, רייבים ומחסנים."],
    ["יוצאים · תל אביב 🌃", 1024, "תל אביב", [], "כל המסיבות בתל אביב והסביבה."],
    ["יוצאים · צפון 🏔️", 812, "צפון", [], "מסיבות בצפון, כולל הסעות מחיפה והקריות."],
    ["יוצאים · חוף ושקיעות 🏖️", 655, null, ["מסיבת חוף"], "מסיבות חוף בקיץ ובחורף."],
    ["יוצאים · היפ הופ ומזרחית 🔥", 903, null, ["היפ הופ", "מזרחית"], "היפ הופ, מזרחית ולהיטים."],
  ];
  const groupIds = groups.map(([name, members, region, cats, description]) =>
    createGroup({ name, kind: "group", parentId: community, chatId: null, members, region, description, categoryIds: ids(cats) }),
  );
  createGroup({
    name: "יוצאים VIP ⭐",
    kind: "group",
    parentId: null,
    chatId: null,
    members: 214,
    region: null,
    description: "לקוחות חוזרים: הטבות ומכירה מוקדמת.",
    categoryIds: [],
  });

  // Announce the next two parties in the groups that fit them, as if it was done in the last days.
  const upcoming = db
    .prepare<[], { id: number }>(
      "SELECT id FROM parties WHERE status = 'on_sale' AND starts_at >= datetime('now') ORDER BY starts_at LIMIT 3",
    )
    .all();
  for (const [i, { id }] of upcoming.entries()) {
    const party = getParty(id);
    if (!party) continue;
    const partyCats = new Set(party.categories.map((c) => c.id));
    const targets = groupIds.filter((gid, idx) => {
      const [, , region, cats] = groups[idx]!;
      return (region && region === party.region) || ids(cats).some((c) => partyCats.has(c)) || gid === groupIds[2];
    });
    if (i < 2) {
      const msgIds = await broadcast({
        groupIds: targets,
        partyId: id,
        text: announcementTemplate(party),
        mediaId: party.cover?.id ?? null,
        scheduledAt: null,
      });
      const sentAt = new Date(Date.now() - (2 - i) * 86400_000 + 4 * 3600_000).toISOString();
      for (const m of msgIds) db.prepare("UPDATE wa_group_messages SET sent_at = ? WHERE id = ?").run(sentAt, m);
    } else {
      await broadcast({
        groupIds: targets,
        partyId: id,
        text: announcementTemplate(party),
        mediaId: party.cover?.id ?? null,
        scheduledAt: daysFromNow(1, 18),
      });
    }
  }
}
