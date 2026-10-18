import type { CompanyRequest, User } from "@/types";
import * as mockAuth from "../mock/auth.service";
import { api, ApiError } from "./client";

export const isFrontendMockAuthEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_AUTH_MODE === "mock";

export type LoginResult = User | {
  mfaRequired: true;
  enrollmentRequired: boolean;
  totpSecret?: string;
  otpauthUrl?: string;
  mfaMethod?: "totp" | "email";
};

export async function login(email: string, password: string) {
  if (isFrontendMockAuthEnabled) return mockAuth.login(email, password);
  return api<LoginResult>("/auth/login", { email: email.trim(), password });
}
export async function verifyMfa(code: string) {
  return api<User>("/auth/verify-mfa", { code: code.trim() });
}
export async function authorizeWorkspace(path: string[]) {
  if (isFrontendMockAuthEnabled) return { allowed: true as const };
  return api<{ allowed: true }>(`/auth/authorize?path=${encodeURIComponent(path.join("/"))}`);
}
export async function getCurrentUser() {
  if (isFrontendMockAuthEnabled) return mockAuth.getCurrentUser();
  try {
    return await api<User>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export async function logout() {
  if (isFrontendMockAuthEnabled) return mockAuth.logout();
  await api("/auth/logout", {});
}
export const passwordChecks = (password: string) => [
  password.length >= 8 && password.length <= 256,
  /[A-Z]/.test(password),
  /[a-z]/.test(password),
  /[0-9]/.test(password),
  /[^A-Za-z0-9]/.test(password),
];
export async function activateAccount(token: string, password: string, confirmation: string) {
  return api<{ success: boolean }>("/auth/activate", { token, password, confirmation });
}
export async function changeOwnPassword(_user: User, password: string, confirmation: string) {
  if (isFrontendMockAuthEnabled) {
    const updated = await mockAuth.changeOwnPassword(_user, password, confirmation);
    window.dispatchEvent(new Event("ai:changed"));
    return updated;
  }
  if (!_user.mustChangePassword) {
    throw new Error(
      "Password change on active accounts is disabled by security policy. Use the email reset flow to change your password.",
    );
  }
  const updated = await api<User>("/auth/change-password", { password, confirmation });
  window.dispatchEvent(new Event("ai:changed"));
  return updated;
}

export async function requestPasswordReset(email: string) {
  return api<{ message: string }>("/auth/forgot-password", { email: email.trim() });
}
export async function verifyResetCode(email: string, code: string) {
  return api<{ success: boolean }>("/auth/verify-reset-code", { email: email.trim(), code });
}
export async function getResetStatus() {
  return api<{ valid: boolean }>("/auth/reset-status");
}
export async function resetPassword(password: string, confirmation: string) {
  return api<{ success: boolean }>("/auth/reset-password", { password, confirmation });
}
export async function requestCompanyAccess(input: Omit<CompanyRequest, "id" | "status" | "submittedAt">) {
  return api<CompanyRequest>("/company-requests", input);
}
