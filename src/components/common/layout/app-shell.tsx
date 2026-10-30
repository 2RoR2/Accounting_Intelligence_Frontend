"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Building2,
  Briefcase,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileCheck2,
  Files,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
  UserRound,
  X,
} from "lucide-react";
import type { User } from "@/types";
import { logout } from "@/lib/api/auth.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import { getTenants, getCompanyRequests } from "@/lib/api/tenant.service";
import { useResource } from "@/features/common/hooks/use-resource";
import { HelpCenter } from "@/features/common/help/help-center";
import { Modal } from "@/components/common/ui";
import Image from "next/image";
import saicLogo from "@/images/saic_logo.png";

export function Brand() {
  return (
    <span className="brand saic-brand">
      <Image src={saicLogo} alt="SAIC" width={132} height={40} priority />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Flattened navigation for PoC (Upload → Extract → Validate → Standardise → Money + Exceptions)
// Document-type, exception-severity and report filters live inside the pages, not the sidebar.
// ---------------------------------------------------------------------------

const adminNav = [
  ["Dashboard", "dashboard", LayoutDashboard],
  ["Companies", "tenants", Building2],
  ["Pending Approvals", "approvals", ClipboardCheck],
  ["Users", "users", Users],
  ["AI Processing", "processing", ScanLine],
  ["Performance", "performance", ChartNoAxesCombined],
  ["Standardised Records", "records", FileCheck2],
  ["Audit Logs", "audit", Activity],
  ["Settings", "settings", Settings2],
  ["Profile", "profile", UserRound],
] as const;

const companyNav = [
  ["Dashboard", "dashboard", LayoutDashboard],
  ["Documents", "documents", Files],
  ["Upload", "upload", Upload],
  ["Exceptions", "exceptions", ShieldCheck],
  ["Standardised Records", "records", FileCheck2],
  ["Contacts", "contacts", Users],
  ["Money In", "money-in", ArrowDownToLine],
  ["Money Out", "money-out", ArrowUpFromLine],
  ["Reports", "reports", ChartNoAxesCombined],
  ["Audit Trail", "audit", Activity],
  ["Users", "users", Users],
  ["Validation Rules", "validation-rules", ClipboardCheck],
  ["Settings", "settings", Settings2],
  ["Profile", "profile", UserRound],
] as const;

const accountantNav = [
  ["Dashboard", "dashboard", LayoutDashboard],
  ["Documents", "documents", Files],
  ["Upload", "upload", Upload],
  ["Exceptions", "exceptions", ShieldCheck],
  ["Validation", "validation", ClipboardCheck],
  ["AI Performance", "ai-performance", ChartNoAxesCombined],
  ["Standardised Records", "records", FileCheck2],
  ["Contacts", "contacts", Users],
  ["Money In", "money-in", ArrowDownToLine],
  ["Money Out", "money-out", ArrowUpFromLine],
  ["Reports", "reports", ChartNoAxesCombined],
  ["Audit Trail", "audit", Activity],
  ["Profile", "profile", UserRound],
] as const;

export function AppShell({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [peek, setPeek] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const rail = !pinned && !peek;

  useEffect(() => {
    if (window.localStorage.getItem("accia-sidebar-pinned") === "0") {
      setPinned(false);
    }
  }, []);

  const setSidebarPinned = (next: boolean) => {
    setPinned(next);
    setPeek(false);
    window.localStorage.setItem("accia-sidebar-pinned", next ? "1" : "0");
  };

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const elements = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>("a, button") ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    elements()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const focusable = elements();
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const data = useResource(
    async () => ({
      tenants: user.role === "SUPER_ADMIN" ? await getTenants(user) : [],
      audit: await getAuditLogs(user),
      pending:
        user.role === "SUPER_ADMIN"
          ? (await getCompanyRequests(user)).filter(
              (r) => r.status === "PENDING",
            ).length
          : 0,
    }),
    user.id,
  );

  const isAdmin = user.role === "SUPER_ADMIN";
  const isCompanyAdmin = user.role === "LOCAL_ADMIN";
  const prefix = isAdmin
    ? "admin"
    : isCompanyAdmin
      ? "company"
      : "workspace";

  const nav = isAdmin
    ? adminNav
    : isCompanyAdmin
      ? companyNav
      : accountantNav;

  const tenant = data.data?.tenants.find((t) => t.id === user.tenantId);
  const latestActivity = data.data?.audit.slice(0, 4) ?? [];
  const notificationHref = `/${prefix}/${isAdmin ? "audit" : "exceptions"}`;
  const currentPage = pathname.split("/")[2] ?? "";

  return (
    <div
      className={`app-shell${pinned ? "" : " sidebar-unextended"}`}
      data-role={user.role.toLowerCase().replaceAll("_", "-")}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={`sidebar ${open ? "open" : ""} ${rail ? "rail" : ""} ${!pinned && peek ? "peek" : ""}`}
        onMouseEnter={() => {
          if (!pinned) setPeek(true);
        }}
        onMouseLeave={() => setPeek(false)}
      >
        <div className="sidebar-head">
          <Link href="/" className="brand-link" aria-label="Accounting Intelligence">
            <Brand />
          </Link>
          <button
            type="button"
            className="sidebar-pin"
            aria-pressed={pinned}
            aria-label={pinned ? "Unextend sidebar" : "Extend sidebar"}
            title={pinned ? "Unextend sidebar" : "Extend sidebar"}
            onClick={() => setSidebarPinned(!pinned)}
          >
            {pinned ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>
        <button
          className="mobile-close icon-btn"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Briefcase size={17} />
          </span>
          <div>
            <strong>
              {isAdmin
                ? "SAIC Platform"
                : (user.tenantName || tenant?.name || "Company workspace")}
            </strong>
            <span>
              {isAdmin
                ? "Super Admin"
                : isCompanyAdmin
                  ? "Company Admin"
                  : "Accountant"}{user.tenantCode ? ` | ${user.tenantCode}` : ""}
            </span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, path, Icon], i) => {
            const active = currentPage === path;
            return (
              <Link
                key={path}
                href={`/${prefix}/${path}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`nav-item ${active ? "active" : ""} ${i === nav.length - 2 ? "nav-separator" : ""}`}
                title={label}
              >
                <Icon size={18} />
                <span>{label}</span>
                {path === "approvals" && !!data.data?.pending && (
                  <span className="nav-count">{data.data.pending}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-health">
            <span className="pulse-dot" />
            <span>Systems operational</span>
            <ArrowUpRight size={13} />
          </div>
          <button
            type="button"
            className="nav-item"
            onClick={() => {
              setOpen(false);
              setHelpOpen(true);
            }}
          >
            <CircleHelp size={18} />
            <span>Help & tutorial</span>
          </button>
          <Link href="/login" className="nav-item">
            <LogOut size={18} />
            <span>Switch account</span>
          </Link>
          <div className="sidebar-version">
            <span>SAIC · Accounting Intelligence</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-toggle"
              aria-label="Open navigation"
              aria-controls="workspace-navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            {currentPage !== "dashboard" && (
              <button
                type="button"
                className="back-button icon-btn"
                aria-label="Go back to the previous page"
                title="Go back"
                onClick={() => {
                  if (window.history.length > 1) {
                    router.back();
                  } else {
                    router.push(`/${prefix}/dashboard`);
                  }
                }}
              >
                <ArrowLeft size={17} />
              </button>
            )}
            <Link className="breadcrumb-home" href={`/${prefix}/dashboard`}>
              {isAdmin ? "SAIC Platform" : (user.tenantName || tenant?.name)}
            </Link>
            <span className="crumb-divider">/</span>
            <strong>
              {nav.find((n) => n[1] === currentPage)?.[0] ?? "Overview"}
            </strong>
          </div>
          <div className="topbar-right">
            <button
              className="help-trigger btn small"
              type="button"
              aria-label="Open help and tutorial"
              onClick={() => {
                setNotifications(false);
                setProfile(false);
                setHelpOpen(true);
              }}
            >
              <CircleHelp size={15} /> Help
            </button>
            <button
              className="notification icon-btn"
              aria-label={
                notifications ? "Close latest activity" : "Open latest activity"
              }
              aria-expanded={notifications}
              onClick={() => {
                setProfile(false);
                setNotifications(!notifications);
              }}
            >
              <Bell size={19} />
              <i />
            </button>
            {notifications && (
              <div
                className="notification-panel"
                role="dialog"
                aria-label="Latest activity"
              >
                <div className="notification-heading">
                  <div>
                    <strong>Latest activity</strong>
                    <span>Newest workspace updates</span>
                  </div>
                  <Activity size={16} />
                </div>
                <div className="notification-list">
                  {latestActivity.length ? (
                    latestActivity.map((entry) => (
                      <div className="notification-item" key={entry.id}>
                        <span className="notification-item-icon">
                          <Activity size={14} />
                        </span>
                        <div>
                          <strong>{entry.action.replaceAll("_", " ")}</strong>
                          <span>
                            {entry.user} · {entry.resource}
                          </span>
                          <time>
                            {new Intl.DateTimeFormat("en-MY", {
                              day: "2-digit",
                              month: "short",
                            }).format(new Date(entry.timestamp))}
                          </time>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="notification-empty">No new activity.</p>
                  )}
                </div>
                <Link
                  className="notification-footer"
                  href={notificationHref}
                  onClick={() => setNotifications(false)}
                >
                  View all activity <ArrowUpRight size={14} />
                </Link>
              </div>
            )}
            <span className="header-divider" />
            <button
              className="profile-button"
              aria-label={`Account menu for ${user.name}`}
              onClick={() => {
                setNotifications(false);
                setProfile(!profile);
              }}
              aria-expanded={profile}
            >
              <span className="avatar">
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" />
                ) : user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")}
              </span>
              <span className="profile-text">
                <strong>{user.name}</strong>
                <small>{user.role.replaceAll("_", " ")}</small>
              </span>
              <ChevronDown size={14} />
            </button>
            {profile && (
              <div className="profile-menu">
                <strong>{user.email}</strong>
                <Link href={`/${prefix}/profile`} onClick={() => setProfile(false)}>
                  My profile
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setProfile(false);
                    setHelpOpen(true);
                  }}
                >
                  <CircleHelp size={15} /> Help & tutorial
                </button>
                <button
                  onClick={async () => {
                    await logout();
                    router.push("/login");
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          {children}
          <footer className="main-footer">
            <span>© 2026 Accounting Intelligence · SAIC</span>
            <button
              type="button"
              className="footer-help-link"
              onClick={() => setHelpOpen(true)}
            >
              Help & helpline
            </button>
          </footer>
        </main>
        {helpOpen && (
          <Modal title="Help & support" onClose={() => setHelpOpen(false)}>
            <HelpCenter compact />
          </Modal>
        )}
        {showBackToTop && (
          <button
            className="back-to-top icon-btn"
            aria-label="Back to top"
            title="Back to top"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
