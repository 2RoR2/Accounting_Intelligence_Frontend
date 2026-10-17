import type { AuditLog, User } from "@/types";
import { get } from "./client";
export async function getAuditLogs(user: User) {
  void user;
  return get<AuditLog[]>("/api/audit");
}
