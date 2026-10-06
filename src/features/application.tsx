"use client";
import Link from "next/link";
import { AppShell } from "@/components/common/layout/app-shell";
import { AccessDenied } from "@/components/common/errors/access-denied";
import { ErrorState, LoadingState } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { authorizeWorkspace, getCurrentUser } from "@/lib/api/auth.service";
import { isAllowedWorkspaceRoute, isPublicRoute } from "@/lib/constants/routes";
import { roleHome } from "@/lib/permissions";
import { PublicPage } from "@/features/auth/public-pages";
import { UserRoutes } from "@/features/users/route-content";
import { ForcePasswordChange } from "@/features/users/force-password";
import { LocalAdminRoutes } from "@/features/localadmin/route-content";
import { SuperAdminRoutes } from "@/features/superadmin/route-content";
import { readDb } from "@/lib/mock/repository";
export function Application({ path }: { path: string[] }) {
  const loadUser = async () => {
    const current = await getCurrentUser();
    if (current && !isPublicRoute(path)) await authorizeWorkspace(path);
    return current;
  };
  const {
    data: user,
    error,
    loading,
  } = useResource(loadUser, path.join("/"));
  const [area] = path;
  if (isPublicRoute(path)) return <PublicPage key={area} page={area} />;
  if (loading) return <LoadingState />;
  if (error || !user)
    return (
      <div className="access-gate">
        <ErrorState
          message={
            error || "Sign in with your company account to enter your workspace."
          }
        />
        <Link className="btn primary" href="/login">
          Continue to login
        </Link>
      </div>
    );
  if (!isAllowedWorkspaceRoute(path, user.role))
    return <AccessDenied homeHref={roleHome(user.role)} />;
  // Workspace data is still fixture-backed during this integration phase. Map
  // a real API demo account to its matching fixture by email before services
  // enforce fixture permissions; production resource APIs will use the API user.
  const fixtureUser = readDb().users.find((candidate) => candidate.email.toLowerCase() === user.email.toLowerCase())
    ?? readDb().users.find((candidate) => candidate.role === user.role && candidate.tenantId === user.tenantId)
    ?? readDb().users.find((candidate) => candidate.role === user.role)
    ?? user;
  const workspaceUser = { ...fixtureUser, mustChangePassword: user.mustChangePassword };
  if (workspaceUser.role === "ACCOUNTANT" && workspaceUser.mustChangePassword !== false)
    return <ForcePasswordChange user={workspaceUser} />;
  return (
    <AppShell user={workspaceUser}>
      {workspaceUser.role === "SUPER_ADMIN" ? (
        <SuperAdminRoutes path={path} user={workspaceUser} />
      ) : workspaceUser.role === "LOCAL_ADMIN" ? (
        <LocalAdminRoutes path={path} user={workspaceUser} />
      ) : (
        <UserRoutes path={path} user={workspaceUser} />
      )}
    </AppShell>
  );
}
