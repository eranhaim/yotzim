export interface Media {
  id: string;
  url: string;
  kind: "image" | "video";
  mime: string;
  width: number | null;
  height: number | null;
  originalName: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface TicketTier {
  name: string;
  price: number;
}

export type PartyStatus = "draft" | "on_sale" | "sold_out" | "cancelled";

export interface Party {
  id: number;
  name: string;
  status: PartyStatus;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  description: string | null;
  lineup: string | null;
  agentNotes: string | null;
  minAge: number | null;
  ticketUrl: string | null;
  ticketTiers: TicketTier[];
  minPrice: number | null;
  cover: Media | null;
  categories: Category[];
  scheduledPosts: number;
  publishedPosts: number;
  createdAt: string;
  updatedAt: string;
}

export interface PartyInput {
  name: string;
  status: PartyStatus;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  description: string | null;
  lineup: string | null;
  agentNotes: string | null;
  minAge: number | null;
  ticketUrl: string | null;
  ticketTiers: TicketTier[];
  coverMediaId: string | null;
  categoryIds: number[];
}

export type PostType = "feed" | "carousel" | "reel" | "story";
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export interface Post {
  id: number;
  partyId: number | null;
  partyName: string | null;
  type: PostType;
  caption: string;
  media: Media[];
  scheduledAt: string | null;
  status: PostStatus;
  igMediaId: string | null;
  permalink: string | null;
  error: string | null;
  simulated: boolean;
  publishedAt: string | null;
}

export interface PostInput {
  partyId: number | null;
  type: PostType;
  caption: string;
  mediaIds: string[];
  scheduledAt: string | null;
  status: "draft" | "scheduled";
}

export type LeadStage = "new" | "qualifying" | "pitched" | "link_sent" | "needs_human" | "not_interested";

export interface Lead {
  id: number;
  channel: "whatsapp" | "simulation";
  phone: string | null;
  waName: string | null;
  name: string | null;
  region: string | null;
  city: string | null;
  genres: string[];
  budget: number | null;
  age: number | null;
  groupSize: number | null;
  preferredDates: string | null;
  notes: string | null;
  stage: LeadStage;
  interestedPartyId: number | null;
  interestedPartyName: string | null;
  sourcePartyId: number | null;
  sourcePartyName: string | null;
  botPaused: boolean;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface TranscriptEntry {
  role: "user" | "assistant" | "human_agent" | "system";
  text: string;
  at: string;
}

export interface LeadEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface LeadDetails {
  lead: Lead;
  transcript: TranscriptEntry[];
  events: LeadEvent[];
}

export interface Meta {
  regions: string[];
  partyStatuses: PartyStatus[];
  companyName: string;
  whatsappBusinessNumber: string;
  instagramLive: boolean;
  agentConfigured: boolean;
  agentModel: string;
  greenApiConfigured: boolean;
}

export interface GoOutImport {
  name: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  ticketUrl: string;
  ticketTiers: TicketTier[];
  cover: Media | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && !url.includes("/auth/")) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? `שגיאה ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
  upload: (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return request<Media[]>("POST", "/api/media", fd);
  },
};
