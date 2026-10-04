import type { User } from "@/types";
import { mutate, now, readDb } from "../mock/repository";
import { assertActive } from "../permissions";
import { log } from "./audit.service";
export async function getAccounts() {
  return structuredClone(readDb().users);
}
export async function login(email: string, password: string) {
  if (!password) throw new Error("Enter a password to continue.");
  const user = readDb().users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
  );
  if (!user)
    throw new Error(
      "No active account was found for this company email. Check the address or activate your invitation first.",
    );
  assertActive(readDb(), user);
  mutate((db) => {
    db.users.find((u) => u.id === user.id)!.lastLogin = now();
  });
  localStorage.setItem("ai:session", user.id);
  return user;
}
export async function getCurrentUser() {
  const key =
    typeof window === "undefined" ? null : localStorage.getItem("ai:session");
  const user = readDb().users.find((u) => u.id === key);
  if (!user) return null;
  assertActive(readDb(), user);
  return user;
}
export async function logout() {
  localStorage.removeItem("ai:session");
}
export const passwordChecks = (password: string) => [
  password.length >= 8,
  /[A-Z]/.test(password),
  /[a-z]/.test(password),
  /[0-9]/.test(password),
  /[^A-Za-z0-9]/.test(password),
];
export async function activateAccount(
  userId: string,
  password: string,
  confirmation: string,
) {
  if (!passwordChecks(password).every(Boolean) || password !== confirmation)
    throw new Error(
      "Meet all password requirements and confirm the same password.",
    );
  return mutate((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user || !["INVITED", "INVITATION_EXPIRED"].includes(user.status))
      throw new Error("Select a pending invitation.");
    const tenant = db.tenants.find((t) => t.id === user.tenantId);
    if (!tenant || tenant.status !== "ACTIVE")
      throw new Error("Company is not active.");
    if (
      user.status === "INVITATION_EXPIRED" &&
      db.users.filter(
        (u) =>
          u.tenantId === tenant.id && ["ACTIVE", "INVITED"].includes(u.status),
      ).length >= tenant.accountLimit
    )
      throw new Error("No account seats available.");
    user.status = "ACTIVE";
    if (user.role === "ACCOUNTANT") user.mustChangePassword = true;
    db.invitations
      .filter((i) => i.userId === userId)
      .forEach((i) => (i.status = "ACTIVE"));
    return user;
  });
}
export async function changeOwnPassword(
  user: User,
  password: string,
  confirmation: string,
) {
  if (user.role !== "ACCOUNTANT")
    throw new Error("Only workspace users change their own password.");
  assertActive(readDb(), user);
  if (!passwordChecks(password).every(Boolean) || password !== confirmation)
    throw new Error("Meet all password requirements and match both passwords.");
  return mutate((db) => {
    const target = db.users.find((candidate) => candidate.id === user.id);
    if (!target || target.role !== "ACCOUNTANT")
      throw new Error("Account was not found.");
    target.mustChangePassword = false;
    log(db, user, "PASSWORD_CHANGED", target.email, "User chose a new password.");
    return target;
  });
}
export async function requestPasswordReset(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid company email.");
  return { message: "Password reset request recorded." };
}
export async function resetPassword(
  password: string,
  confirmation: string,
) {
  if (!passwordChecks(password).every(Boolean) || password !== confirmation)
    throw new Error("Meet all password requirements and match both passwords.");
  return { success: true };
}
