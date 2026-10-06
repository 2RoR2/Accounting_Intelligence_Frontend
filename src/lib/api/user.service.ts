import type { User, UserStatus } from "@/types";
import { id, mutate, now, readDb } from "../mock/repository";
import { assertActive, assertTenant, requireRole } from "../permissions";
import { log } from "./audit.service";
import { usage } from "./tenant.service";
import { passwordChecks } from "./auth.service";

export async function updateOwnProfile(user: User, name: string, avatar?: string) {
  assertActive(readDb(), user);
  if (name.trim().length < 2) throw new Error("Enter a valid display name.");
  if (avatar && !avatar.startsWith("data:image/")) throw new Error("Select a valid profile image.");
  return mutate((db) => {
    const target = db.users.find((candidate) => candidate.id === user.id);
    if (!target) throw new Error("Profile was not found.");
    target.name = name.trim();
    target.avatar = avatar;
    log(db, user, "PROFILE_UPDATED", target.email, "Name or profile image updated.");
    return target;
  });
}

export async function updateAccountantCredentials(user: User, userId: string, name: string, password: string) {
  requireRole(user, ["LOCAL_ADMIN"]);
  assertActive(readDb(), user);
  if (name.trim().length < 2) throw new Error("Enter a valid accountant name.");
  if (password && !passwordChecks(password).every(Boolean))
    throw new Error("Use 8+ characters with uppercase, lowercase, number, and symbol.");
  return mutate((db) => {
    const target = db.users.find((candidate) => candidate.id === userId);
    if (!target || target.tenantId !== user.tenantId || target.role !== "ACCOUNTANT")
      throw new Error("Account is not manageable in this workspace.");
    target.name = name.trim();
    if (password) target.mustChangePassword = true;
    log(db, user, "ACCOUNTANT_CREDENTIALS_UPDATED", target.email, password ? "Name updated and password reset recorded." : "Name updated.");
    return target;
  });
}
export async function getTenantUsers(user: User, tenantId?: string) {
  assertActive(readDb(), user);
  requireRole(user, ["SUPER_ADMIN", "LOCAL_ADMIN"]);
  if (tenantId) assertTenant(user, tenantId);
  return readDb().users.filter(
    (u) =>
      (!tenantId || u.tenantId === tenantId) &&
      (user.role === "SUPER_ADMIN" || u.tenantId === user.tenantId),
  );
}
export async function inviteAccountant(
  user: User,
  name: string,
  email: string,
) {
  requireRole(user, ["LOCAL_ADMIN"]);
  assertActive(readDb(), user);
  const tenant = readDb().tenants.find((t) => t.id === user.tenantId)!;
  if (usage(tenant.id) >= tenant.accountLimit)
    throw new Error("ACCOUNT LIMIT REACHED. Request more accounts.");
  if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a full name and valid company email.");
  return mutate((db) => {
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
      throw new Error("This company email is already registered.");
    const invited: User = {
      id: id("USR"),
      name,
      email,
      role: "ACCOUNTANT",
      tenantId: tenant.id,
      status: "INVITED",
      invitedBy: user.name,
      invitedAt: now(),
      lastLogin: "—",
    };
    db.users.push(invited);
    db.invitations.push({
      id: id("INV"),
      userId: invited.id,
      tenantId: tenant.id,
      invitedBy: user.name,
      createdAt: now(),
      status: "INVITED",
    });
    log(db, user, "ACCOUNTANT_INVITED", email, "Invitation created.");
    return invited;
  });
}
export async function changeUserStatus(
  user: User,
  userId: string,
  status: UserStatus,
) {
  requireRole(user, ["LOCAL_ADMIN"]);
  assertActive(readDb(), user);
  mutate((db) => {
    const target = db.users.find((u) => u.id === userId);
    if (
      !target ||
      target.tenantId !== user.tenantId ||
      target.role !== "ACCOUNTANT"
    )
      throw new Error("Account is not manageable in this workspace.");
    const tenant = db.tenants.find((t) => t.id === user.tenantId)!;
    if (
      ["ACTIVE", "INVITED"].includes(status) &&
      !["ACTIVE", "INVITED"].includes(target.status) &&
      usage(tenant.id) >= tenant.accountLimit
    )
      throw new Error("Account limit reached.");
    target.status = status;
    db.invitations
      .filter((i) => i.userId === userId)
      .forEach((i) => (i.status = status));
    log(db, user, "USER_STATUS_CHANGED", target.email, status);
  });
}
export const disableUser = (user: User, id: string) =>
  changeUserStatus(user, id, "DISABLED");
export async function resendInvitation(user: User, userId: string) {
  await changeUserStatus(user, userId, "INVITED");
  mutate((db) => {
    const target = db.users.find((u) => u.id === userId)!;
    target.invitedAt = now();
    log(db, user, "INVITATION_RESENT", target.email);
  });
}
