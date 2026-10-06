import type { Database } from "@/types";
import { seedDatabase } from "./seed";
const KEY = "accounting-intelligence-v4";
let memory: Database | undefined;
export function readDb(): Database {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Database;
        if (parsed.version === 4) return parsed;
      } catch {
        /* Recover malformed local storage with fixtures. */
      }
    }
  }
  return (memory ??= seedDatabase());
}
export function writeDb(db: Database) {
  memory = db;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(db));
    window.dispatchEvent(new Event("ai:changed"));
  }
}
export function mutate<T>(operation: (db: Database) => T): T {
  const db = structuredClone(readDb());
  const result = operation(db);
  writeDb(db);
  return result;
}
export const id = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const now = () => new Date().toISOString();
export function resetRepository() {
  memory = seedDatabase();
  writeDb(memory);
  if (typeof window !== "undefined")
    window.localStorage.removeItem("ai:session");
}
