import type { Page, Route } from "@playwright/test";

type MockUser = {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "LOCAL_ADMIN" | "ACCOUNTANT";
  tenantId: string | null;
  status: "ACTIVE";
  mustChangePassword: false;
  invitedBy: string;
  invitedAt: string;
  lastLogin: string;
};

const USERS: Record<string, MockUser> = {
  "admin@saic.example": {
    id: "USR-001",
    name: "SAIC Administrator",
    email: "admin@saic.example",
    role: "SUPER_ADMIN",
    tenantId: null,
    status: "ACTIVE",
    mustChangePassword: false,
    invitedBy: "",
    invitedAt: "",
    lastLogin: "",
  },
  "alice@abc.example": {
    id: "USR-002",
    name: "Alice Tan",
    email: "alice@abc.example",
    role: "LOCAL_ADMIN",
    tenantId: "TENANT_001",
    status: "ACTIVE",
    mustChangePassword: false,
    invitedBy: "",
    invitedAt: "",
    lastLogin: "",
  },
  "rachel@abc.example": {
    id: "USR-003",
    name: "Rachel Chong",
    email: "rachel@abc.example",
    role: "ACCOUNTANT",
    tenantId: "TENANT_001",
    status: "ACTIVE",
    mustChangePassword: false,
    invitedBy: "",
    invitedAt: "",
    lastLogin: "",
  },
  "sarah@xyz.example": {
    id: "USR-006",
    name: "Sarah Lim",
    email: "sarah@xyz.example",
    role: "ACCOUNTANT",
    tenantId: "TENANT_002",
    status: "ACTIVE",
    mustChangePassword: false,
    invitedBy: "",
    invitedAt: "",
    lastLogin: "",
  },
};

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function installAuthMock(page: Page) {
  let current: MockUser | null = null;
  let pending: MockUser | null = null;
  await page.route("**/api/auth/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/login") {
      const input = route.request().postDataJSON() as { email?: string };
      pending = USERS[input.email?.toLowerCase() ?? ""] ?? null;
      if (!pending) return json(route, 401, { detail: "Invalid email or password." });
      if (pending.role === "ACCOUNTANT") {
        current = pending;
        return json(route, 200, current);
      }
      return json(route, 200, {
        mfaRequired: true,
        enrollmentRequired: true,
        totpSecret: "JBSWY3DPEHPK3PXP",
        otpauthUrl: "otpauth://totp/Accounting%20Intelligence?secret=JBSWY3DPEHPK3PXP",
      });
    }
    if (url.pathname === "/api/auth/verify-mfa") {
      current = pending;
      return current
        ? json(route, 200, current)
        : json(route, 401, { detail: "Authentication challenge expired." });
    }
    if (url.pathname === "/api/auth/me") {
      return current
        ? json(route, 200, current)
        : json(route, 401, { detail: "Sign in." });
    }
    if (url.pathname === "/api/auth/authorize") {
      return current
        ? json(route, 200, { allowed: true })
        : json(route, 401, { detail: "Sign in." });
    }
    if (url.pathname === "/api/auth/logout") {
      current = null;
      pending = null;
      return json(route, 200, { success: true });
    }
    return json(route, 404, { detail: "Not found." });
  });
}

export async function completeMockLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Company email *", { exact: true }).fill(email);
  await page.getByLabel("Password *", { exact: true }).fill("WorkspacePassword!");
  await page.getByRole("button", { name: "Continue with email" }).click();
  if (USERS[email.toLowerCase()]?.role !== "ACCOUNTANT") {
    await page.getByLabel("Authenticator code *", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "Enable and sign in" }).click();
  }
  await page.getByRole("link", { name: /Continue to dashboard/ }).click();
}
