import { saveRemoteImage, toMediaDto } from "./media.js";
import type { TicketTier } from "./parties.js";

/**
 * Imports a party draft from a public Go-Out event page.
 * Go-Out renders schema.org JSON-LD (an Event plus one Product per ticket tier) into the HTML.
 */

interface LdOffer {
  price?: string | number;
  url?: string;
}
interface LdNode {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  image?: string | string[];
  startDate?: string;
  endDate?: string;
  location?: { name?: string; address?: string | { streetAddress?: string; addressLocality?: string } };
  offers?: LdOffer | LdOffer[];
}

const CITY_TO_REGION: [RegExp, string, string][] = [
  [/tel[\s-]?aviv|תל[\s-]?אביב|יפו|jaffa/i, "תל אביב", "תל אביב"],
  [/haifa|חיפה|קריית|krayot/i, "חיפה והקריות", "חיפה"],
  [/jerusalem|ירושלים/i, "ירושלים", "ירושלים"],
  [/eilat|אילת/i, "אילת", "אילת"],
  [/be'?er[\s-]?sheva|באר[\s-]?שבע|מצפה רמון|mitzpe/i, "דרום", "באר שבע"],
  [/herzliya|הרצליה|netanya|נתניה|ra'?anana|רעננה|kfar saba|כפר סבא/i, "שרון", ""],
  [/rishon|ראשון|rehovot|רחובות|ashdod|אשדוד|ashkelon|אשקלון/i, "שפלה", ""],
  [/ramat[\s-]?gan|רמת[\s-]?גן|petah|פתח[\s-]?תקווה|holon|חולון|bat[\s-]?yam|בת[\s-]?ים|givatayim|גבעתיים/i, "מרכז", ""],
  [/nahariya|נהריה|karmiel|כרמיאל|tiberias|טבריה|safed|צפת|galil|גליל|golan|גולן|afula|עפולה/i, "צפון", ""],
];

function guessRegion(address: string) {
  for (const [re, region, city] of CITY_TO_REGION) {
    if (re.test(address)) return { region, city: city || null };
  }
  return { region: null, city: null };
}

function cleanTicketUrl(raw: string) {
  const url = new URL(raw);
  // Keep Go-Out's own "ref" (promoter / tracking code); drop ad-click and utm parameters.
  for (const key of [...url.searchParams.keys()]) {
    if (key === "fbclid" || key === "gclid" || key.startsWith("utm_")) url.searchParams.delete(key);
  }
  return url.toString();
}

function types(node: LdNode) {
  const t = node["@type"];
  return Array.isArray(t) ? t : t ? [t] : [];
}

function priceOf(offers: LdNode["offers"]) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  const prices = list.map((o) => Number(o.price)).filter((p) => Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

export async function importFromGoOut(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("הקישור לא תקין");
  }
  if (!/(^|\.)go-out\.co$/i.test(url.hostname)) throw new Error("זה לא קישור של Go-Out");

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (YotzimBackoffice)", "Accept-Language": "he" } });
  if (!res.ok) throw new Error(`Go-Out החזיר שגיאה ${res.status}`);
  const html = await res.text();

  const nodes: LdNode[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]!) as LdNode | LdNode[];
      nodes.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      /* ignore broken blocks */
    }
  }
  const event = nodes.find((n) => types(n).some((t) => t.endsWith("Event")));
  if (!event) throw new Error("לא נמצאו פרטי אירוע בעמוד");

  const tiers: TicketTier[] = [];
  for (const n of nodes) {
    if (!types(n).includes("Product")) continue;
    const price = priceOf(n.offers);
    if (n.name && price != null && !tiers.some((t) => t.name === n.name && t.price === price)) {
      tiers.push({ name: n.name, price });
    }
  }
  if (!tiers.length) {
    const price = priceOf(event.offers);
    if (price != null) tiers.push({ name: "כרטיס", price });
  }

  const loc = event.location;
  const address =
    typeof loc?.address === "string" ? loc.address : (loc?.address?.streetAddress ?? loc?.address?.addressLocality ?? "");
  const { region, city } = guessRegion(address);
  const venueName = loc?.name ?? (address ? address.split(",")[0]!.trim() : null);

  // The JSON-LD image path is sometimes missing "/events/"; the og:image tags are reliable.
  const ldImage = Array.isArray(event.image) ? event.image[0] : event.image;
  const ogImages = [...html.matchAll(/<meta[^>]*property="og:image(?::alt)?"[^>]*content="([^"]+)"/gi)].map((m) => m[1]!);
  const candidates = [
    ...(ldImage ? [ldImage.replace(/^(https:\/\/images\.go-out\.co\/)(?!events\/)/, "$1events/"), ldImage] : []),
    ...ogImages.filter((u) => /coverImage/i.test(u)),
    ...ogImages,
  ];
  let cover = null;
  for (const candidate of new Set(candidates)) {
    cover = await saveRemoteImage(candidate);
    if (cover) break;
  }

  return {
    name: event.name ?? "",
    description: event.description ?? null,
    startsAt: event.startDate ? new Date(event.startDate).toISOString() : null,
    endsAt: event.endDate ? new Date(event.endDate).toISOString() : null,
    venueName,
    address: address || null,
    city,
    region,
    ticketUrl: cleanTicketUrl(rawUrl.trim()),
    ticketTiers: tiers,
    cover: cover ? toMediaDto(cover) : null,
  };
}
