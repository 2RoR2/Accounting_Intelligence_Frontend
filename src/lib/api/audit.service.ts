import type { Database, User } from "@/types";
import { id, now, readDb } from "../mock/repository";
import { assertActive } from "../permissions";
export function log(
  db: Database,
  user: User,
  action: string,
  resource: string,
  details = "",
  tenantId: string | null = user.tenantId,
) {
  db.audit.unshift({
    id: id("AUD"),
    tenantId,
    user: user.name,
    role: user.role,
    action,
    resource,
    details,
    timestamp: now(),
  });
}
export async function getAuditLogs(user: User) {
  assertActive(readDb(), user);
  return readDb()
    .audit.filter(
      (a) =>
        user.role === "SUPER_ADMIN" ||
        (a.tenantId === user.tenantId &&
          (user.role === "LOCAL_ADMIN" || a.user === user.name)),
    )
    .map((entry) =>
      user.role === "SUPER_ADMIN" && entry.action === "EXTRACTION_CORRECTED"
        ? {
            ...entry,
            details:
              "Extraction field corrected; financial details require Support View.",
          }
        : entry,
    );
}
