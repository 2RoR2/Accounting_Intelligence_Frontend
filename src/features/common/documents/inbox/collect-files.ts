/**
 * Turns a drop, a folder pick or a paste into a flat list of files for the Inbox queue.
 * Folders are walked (up to 6 levels; deeper folders are reported, not opened); system files such as .DS_Store, Thumbs.db and
 * desktop.ini are left out, and inside a folder only PDFs and photos are kept, so a
 * dropped month folder does not fill the list with files that can never be read.
 */

const SYSTEM_FILES = /^(\.|thumbs\.db$|desktop\.ini$)/i;
const READABLE = /\.(pdf|png|jpe?g)$/i;
const MAX_DEPTH = 6;

/**
 * `skipped`: files left out because they are not PDFs or photos, could not be opened, or sit in a folder
 * nested deeper than MAX_DEPTH. `tooDeep`: how many folders were not opened because of that limit.
 */
export type Collected = { files: File[]; skipped: number; tooDeep: number };

/** A file from a dropped folder, with its path inside the drop ("August/photos/receipt.jpg"). */
export type PathedFile = File & { relativePath?: string };

/** Records where a dropped file sat, so two "receipt.jpg" from different folders stay two files. */
function withPath(file: File, fullPath: string): PathedFile {
  const relativePath = fullPath.replace(/^\/+/, "");
  if (relativePath && relativePath !== file.name) Object.defineProperty(file, "relativePath", { value: relativePath });
  return file as PathedFile;
}

/** Keeps readable files from a folder; `skipped` counts the rest (system files are not counted). */
export function keepFromFolder(files: readonly File[]): Collected {
  const kept: File[] = [];
  let skipped = 0;
  for (const file of files) {
    if (SYSTEM_FILES.test(file.name)) continue;
    if (READABLE.test(file.name)) kept.push(file);
    else skipped += 1;
  }
  return { files: kept, skipped, tooDeep: 0 };
}

function readEntries(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

type WalkCounts = { unreadable: number; tooDeep: number };

/**
 * Adds the files under `entry` to `out`. One unreadable file or sub-folder (a permission error, a file deleted
 * mid-drop) is counted in `unreadable` and the rest still goes through; a folder below MAX_DEPTH levels is not
 * opened and is counted in `tooDeep`, so the page can say so instead of dropping it silently.
 */
async function walk(entry: FileSystemEntry, out: File[], depth: number, counts: WalkCounts): Promise<void> {
  if (entry.isFile) {
    try {
      out.push(withPath(await entryFile(entry as FileSystemFileEntry), entry.fullPath ?? ""));
    } catch {
      if (!SYSTEM_FILES.test(entry.name)) counts.unreadable += 1;
    }
    return;
  }
  if (!entry.isDirectory) return;
  if (depth >= MAX_DEPTH) {
    counts.tooDeep += 1;
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  try {
    // readEntries returns at most ~100 entries per call; keep reading until it returns none.
    for (let batch = await readEntries(reader); batch.length; batch = await readEntries(reader)) {
      for (const child of batch) await walk(child, out, depth + 1, counts);
    }
  } catch {
    counts.unreadable += 1; // this folder (or the rest of it) could not be listed
  }
}

/** Files from a drop. Dropped folders are walked; loose files are kept as dropped. */
export async function filesFromDrop(data: DataTransfer): Promise<Collected> {
  const items = Array.from(data.items ?? []).filter((item) => item.kind === "file");
  // Entries must be taken before the first await: the browser empties the DataTransfer after the event.
  const entries = items.map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null));
  if (!entries.some((entry) => entry?.isDirectory)) return { files: Array.from(data.files), skipped: 0, tooDeep: 0 };
  const fallback = items.map((item) => item.getAsFile());
  const loose: File[] = [];
  const fromFolders: File[] = [];
  const counts: WalkCounts = { unreadable: 0, tooDeep: 0 };
  for (const [index, entry] of entries.entries()) {
    if (entry?.isDirectory) await walk(entry, fromFolders, 0, counts);
    else if (entry?.isFile) await walk(entry, loose, 0, counts);
    else if (fallback[index]) loose.push(fallback[index]!);
  }
  const folder = keepFromFolder(fromFolders);
  return { files: [...loose, ...folder.files], skipped: folder.skipped + counts.unreadable + counts.tooDeep, tooDeep: counts.tooDeep };
}

/** Pasted screenshots all arrive as "image.png"; give each a readable, unique name. */
export function namePasted(file: File, now = new Date()) {
  if (!/^image\.(png|jpe?g)$/i.test(file.name)) return file;
  const stamp = now.toTimeString().slice(0, 8).replaceAll(":", "-");
  const extension = file.name.split(".").pop()!.toLowerCase();
  return new File([file], `Pasted image ${stamp}.${extension}`, { type: file.type, lastModified: now.getTime() });
}
