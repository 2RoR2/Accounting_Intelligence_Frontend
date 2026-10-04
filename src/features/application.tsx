"use client";
import Link from "next/link";
import { AppShell } from "@/components/common/layout/app-shell";
import { AccessDenied } from "@/components/common/errors/access-denied";
import { ErrorState, LoadingState } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { getCurrentUser } from "@/lib/api/auth.service";
import { isAllowedWorkspaceRoute, isPublicRoute } from "@/lib/constants/routes";
import { roleHome } from "@/lib/permissions";
import { PublicPage } from "@/features/auth/public-pages";
import { UserRoutes } from "@/features/users/route-content";
import { ForcePasswordChange } from "@/features/users/force-password";
import { LocalAdminRoutes } from "@/features/localadmin/route-content";
import { SuperAdminRoutes } from "@/features/superadmin/route-content";
export function Application({ path }: { path: string[] }) {
  const {
    data: user,
    error,
    loading,
  } = useResource(getCurrentUser, path.join("/"));
  const [area] = path;
  if (isPublicRoute(path)) return <PublicPage page={area} />;
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
  if (user.role === "ACCOUNTANT" && user.mustChangePassword !== false)
    return <ForcePasswordChange user={user} />;
  return (
    <AppShell user={user}>
      {user.role === "SUPER_ADMIN" ? (
        <SuperAdminRoutes path={path} user={user} />
      ) : user.role === "LOCAL_ADMIN" ? (
        <LocalAdminRoutes path={path} user={user} />
      ) : (
        <UserRoutes path={path} user={user} />
      )}
    </AppShell>
  );
}
