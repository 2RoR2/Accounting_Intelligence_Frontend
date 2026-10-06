import type { User } from "@/types";
import { mutate, readDb } from "../mock/repository";
import { requireRole } from "../permissions";
import { log } from "./audit.service";
export async function getSettings(user: User) {
  const key = user.role === "SUPER_ADMIN" ? "platform" : user.tenantId;
  return {
    timezone: readDb().settings[`${key}:timezone`] ?? "Asia/Kuala_Lumpur",
    notifications: readDb().settings[`${key}:notifications`] ?? "enabled",
  };
}
export async function saveSettings(
  user: User,
  settings: { timezone: string; notifications: string },
) {
  requireRole(user, ["SUPER_ADMIN", "LOCAL_ADMIN"]);
  mutate((db) => {
    const key = user.role === "SUPER_ADMIN" ? "platform" : user.tenantId;
    db.settings[`${key}:timezone`] = settings.timezone;
    db.settings[`${key}:notifications`] = settings.notifications;
    log(db, user, "SETTINGS_UPDATED", key!, "Workspace preferences saved.");
  });
}
