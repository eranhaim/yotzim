import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { config } from "./config.js";
import { db, nowIso } from "./db.js";

export const MEDIA_DIR = path.join(config.dataDir, "media");
const TMP_DIR = path.join(MEDIA_DIR, "tmp");
fs.mkdirSync(TMP_DIR, { recursive: true });

export interface MediaRow {
  id: string;
  file_name: string;
  original_name: string | null;
  mime: string;
  kind: "image" | "video";
  size: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export function mediaUrl(fileName: string) {
  return `/media/${fileName}`;
}

/** Absolute URL that Instagram's servers download from. */
export function publicMediaUrl(fileName: string) {
  return `${config.publicBaseUrl}/media/${fileName}`;
}

export function toMediaDto(row: MediaRow) {
  return {
    id: row.id,
    url: mediaUrl(row.file_name),
    kind: row.kind,
    mime: row.mime,
    width: row.width,
    height: row.height,
    originalName: row.original_name,
  };
}
export type MediaDto = ReturnType<typeof toMediaDto>;

const getMediaStmt = db.prepare<[string], MediaRow>("SELECT * FROM media WHERE id = ?");
export function getMedia(id: string) {
  return getMediaStmt.get(id);
}
export function getMediaMany(ids: string[]) {
  return ids.map((id) => getMediaStmt.get(id)).filter((m): m is MediaRow => Boolean(m));
}

const insertMedia = db.prepare(
  `INSERT INTO media (id, file_name, original_name, mime, kind, size, width, height, created_at)
   VALUES (@id, @file_name, @original_name, @mime, @kind, @size, @width, @height, @created_at)`,
);

/**
 * Instagram accepts only JPEG images, so every image is converted to JPEG
 * (auto-rotated, max 1440px wide, which is Instagram's own maximum).
 */
export async function saveImage(input: string | Buffer, originalName: string | null): Promise<MediaRow> {
  const id = crypto.randomUUID();
  const fileName = `${id}.jpg`;
  const target = path.join(MEDIA_DIR, fileName);
  const info = await sharp(input)
    .rotate()
    .resize({ width: 1440, withoutEnlargement: true })
    .flatten({ background: "#000000" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(target);
  const row: MediaRow = {
    id,
    file_name: fileName,
    original_name: originalName,
    mime: "image/jpeg",
    kind: "image",
    size: info.size,
    width: info.width,
    height: info.height,
    created_at: nowIso(),
  };
  insertMedia.run(row);
  return row;
}

async function saveVideo(tmpPath: string, originalName: string, mime: string): Promise<MediaRow> {
  const id = crypto.randomUUID();
  const ext = mime === "video/quicktime" ? "mov" : "mp4";
  const fileName = `${id}.${ext}`;
  const target = path.join(MEDIA_DIR, fileName);
  await fs.promises.rename(tmpPath, target);
  const size = (await fs.promises.stat(target)).size;
  const row: MediaRow = {
    id,
    file_name: fileName,
    original_name: originalName,
    mime,
    kind: "video",
    size,
    width: null,
    height: null,
    created_at: nowIso(),
  };
  insertMedia.run(row);
  return row;
}

export const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 300 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith("image/") || ["video/mp4", "video/quicktime"].includes(file.mimetype);
    cb(null, ok);
  },
});

export async function storeUploadedFile(file: Express.Multer.File): Promise<MediaRow> {
  // multer decodes the name as latin1; Hebrew file names need utf8.
  const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
  if (file.mimetype.startsWith("video/")) return saveVideo(file.path, originalName, file.mimetype);
  try {
    return await saveImage(file.path, originalName);
  } finally {
    fs.promises.unlink(file.path).catch(() => {});
  }
}

/** Downloads a remote image (for example a Go-Out cover) into the media library. */
export async function saveRemoteImage(url: string): Promise<MediaRow | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (YotzimBackoffice)" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await saveImage(buf, path.basename(new URL(url).pathname));
  } catch {
    return null;
  }
}
