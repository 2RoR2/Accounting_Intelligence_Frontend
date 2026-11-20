import type { User } from "@/types";
import { requireRole } from "../permissions";
import type { HomeSummary } from "../today";
import { get } from "./client";

/** The Today page figures (backend `GET /api/home/summary`, plan v2 B3). Accountants and local admins only. */
export async function getHomeSummary(user: User) {
  requireRole(user, ["LOCAL_ADMIN", "ACCOUNTANT"]);
  return get<HomeSummary>("/api/home/summary");
}
