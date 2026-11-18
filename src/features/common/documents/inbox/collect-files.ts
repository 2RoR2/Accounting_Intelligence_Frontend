/**
 * Turns a drop, a folder pick or a paste into a flat list of files for the Inbox queue.
 * Folders are walked (up to 6 levels); system files such as .DS_Store, Thumbs.db and
 * desktop.ini are left out, and inside a folder only PDFs and photos are kept, so a
 * dropped month folder does not fill the list with files that can never be read.
 */

const SYSTEM_FILES = /^(\.|thumbs\.db$|desktop\.ini$)/i;
const READABLE = /\.(pdf|png|jpe?g)$/i;
const MAX_DEPTH = 6;

/** `skipped`: files left out because they are not PDFs or photos, or could not be opened. */
export type Collected = { files: File[]; skipped: number };

/** Keeps readable files from a folder; `skipped` counts the rest (system files are not counted). */
export function keepFromFolder(files: readonly File[]): Collected {
  const kept: File[] = [];
  let skipped = 0;
  for (const file of files) {
    if (SYSTEM_FILES.test(file.name)) continue;
    if (READABLE.test(file.name)) kept.push(file);
    else skipped += 1;
  }
  return { files: kept, skipped };
}

function readEntries(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

/**
 * Adds the files under `entry` to `out`. Returns how many could not be opened: one unreadable file or
 * sub-folder (a permission error, a file deleted mid-drop) is counted and the rest of the folder still goes through.
 */
async function walk(entry: FileSystemEntry, out: File[], depth: number): Promise<number> {
  if (entry.isFile) {
    try {
      out.push(await entryFile(entry as FileSystemFileEntry));
      return 0;
    } catch {
      return SYSTEM_FILES.test(entry.name) ? 0 : 1;
    }
  }
  if (!entry.isDirectory || depth >= MAX_DEPTH) return 0;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  let unreadable = 0;
  try {
    // readEntries returns at most ~100 entries per call; keep reading until it returns none.
    for (let batch = await readEntries(reader); batch.length; batch = await readEntries(reader)) {
      for (const child of batch) unreadable += await walk(child, out, depth + 1);
    }
  } catch {
    unreadable += 1; // this folder (or the rest of it) could not be listed
  }
  return unreadable;
}

/** Files from a drop. Dropped folders are walked; loose files are kept as dropped. */
export async function filesFromDrop(data: DataTransfer): Promise<Collected> {
  const items = Array.from(data.items ?? []).filter((item) => item.kind === "file");
  // Entries must be taken before the first await: the browser empties the DataTransfer after the event.
  const entries = items.map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null));
  if (!entries.some((entry) => entry?.isDirectory)) return { files: Array.from(data.files), skipped: 0 };
  const fallback = items.map((item) => item.getAsFile());
  const loose: File[] = [];
  const fromFolders: File[] = [];
  let unreadable = 0;
  for (const [index, entry] of entries.entries()) {
    if (entry?.isDirectory) unreadable += await walk(entry, fromFolders, 0);
    else if (entry?.isFile) unreadable += await walk(entry, loose, 0);
    else if (fallback[index]) loose.push(fallback[index]!);
  }
  const folder = keepFromFolder(fromFolders);
  return { files: [...loose, ...folder.files], skipped: folder.skipped + unreadable };
}

/** Pasted screenshots all arrive as "image.png"; give each a readable, unique name. */
export function namePasted(file: File, now = new Date()) {
  if (!/^image\.(png|jpe?g)$/i.test(file.name)) return file;
  const stamp = now.toTimeString().slice(0, 8).replaceAll(":", "-");
  const extension = file.name.split(".").pop()!.toLowerCase();
  return new File([file], `Pasted image ${stamp}.${extension}`, { type: file.type, lastModified: now.getTime() });
}
