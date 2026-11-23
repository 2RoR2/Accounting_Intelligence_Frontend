"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Building2,
  ChartNoAxesCombined,
  BookOpen,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileCheck2,
  Files,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sun,
  Upload,
  Users,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { activeNavItem, jobNavigation, navHref, navParent, type NavIcon, type NavSection } from "./navigation";
import { ruleSentence } from "@/lib/glossary";
import { GlobalSearch } from "./global-search";
import type { User } from "@/types";
import { logout } from "@/lib/api/auth.service";
import { getAuditLogs } from "@/lib/api/audit.service";
import { getExceptions } from "@/lib/api/document.service";
import { getTenants, getCompanyRequests } from "@/lib/api/tenant.service";
import { useResource } from "@/features/common/hooks/use-resource";
import { HelpCenter } from "@/features/common/help/help-center";
import { getNotifications, markNotificationRead } from "@/lib/api/workflow.service";
import { Modal } from "@/components/common/ui";
import Image from "next/image";
import accordAiLogo from "@/images/AccordAI_logo.png";

export function Brand() {
  return (
    <span className="brand accordAi-brand">
      <Image src={accordAiLogo} alt="AccordAI" width={132} height={40} priority />
    </span>
  );
}

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

// Accountant and local-admin menu by accounting job; the entries live in ./navigation.
const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  today: LayoutDashboard, upload: Upload, review: Files, fix: ShieldCheck, approve: ClipboardCheck,
  bill: ArrowUpFromLine, receipt: FileCheck2, invoice: ArrowDownToLine, records: FileCheck2,
  "money-in": ArrowDownToLine, "money-out": ArrowUpFromLine, reconcile: ClipboardCheck, contacts: Users,
  accounts: BookOpen, reports: ChartNoAxesCombined, settings: Settings2, users: Users, rules: ClipboardCheck,
  audit: Activity, system: ScanLine, profile: UserRound, bank: Building2,
};
// Pages reachable from inside other pages, not from the menu: their breadcrumb title.
const PAGE_TITLES: Record<string, string> = {
  records: "Approved records", "validation-overview": "Checks overview", evaluation: "Reading accuracy",
  performance: "Processing performance", help: "Help", ledger: "Accounting",
};

const navScrollPositions = new Map<string, number>();
const navMenus = new Map<string, Record<string, boolean>>();
function rememberNavScroll(key: string, top: number) {
  navScrollPositions.set(key, top);
  try { window.sessionStorage.setItem(key, String(top)); } catch { /* Storage is optional. */ }
}
function savedNavTop(key: string) {
  const saved = navScrollPositions.get(key);
  if (saved !== undefined) return saved;
  try { return Number(window.sessionStorage.getItem(key)) || 0; } catch { return 0; }
}
/** Scrolls only the menu (never the page) so the open entry is visible. */
function revealActive(nav: HTMLElement) {
  const leaf = nav.querySelector<HTMLElement>("[aria-current='page']");
  const active = leaf?.getClientRects().length ? leaf : nav.querySelector<HTMLElement>(".nav-item.active");
  if (!active) return;
  const box = nav.getBoundingClientRect();
  const item = active.getBoundingClientRect();
  if (item.top < box.top + 8) nav.scrollTop -= box.top + 8 - item.top;
  else if (item.bottom > box.bottom - 8) nav.scrollTop += item.bottom - (box.bottom - 8);
}

export function AppShell({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [peek, setPeek] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [navScrolling, setNavScrolling] = useState(false);
  // Menu groups start open, as in the team's layout; a click closes one.
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [themePreference, setThemePreference] = useState<"light" | "dark" | "system">("system");
  const [darkMode, setDarkMode] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const rail = !pinned && !peek;
  const navScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const navKey = `accia-nav-scroll:${user.id}`;

  function handleNavScroll() {
    if (user.role !== "SUPER_ADMIN" && !rail && navRef.current) {
      rememberNavScroll(navKey, navRef.current.scrollTop);
    }
    setNavScrolling(true);
    if (navScrollTimer.current) clearTimeout(navScrollTimer.current);
    navScrollTimer.current = setTimeout(() => setNavScrolling(false), 650);
  }

  useLayoutEffect(() => {
    const saved = navMenus.get(navKey);
    if (saved) setExpandedMenus(saved);
    return () => {
      if (navScrollTimer.current) clearTimeout(navScrollTimer.current);
    };
  }, [navKey]);

  useEffect(() => {
    if (window.localStorage.getItem("accia-sidebar-pinned") === "0") {
      setPinned(false);
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("accordai-theme");
    const preference = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setThemePreference(preference);
    setDarkMode(preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    if (themePreference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDarkMode(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [themePreference]);

  const cycleTheme = () => {
    const next = themePreference === "light" ? "dark" : themePreference === "dark" ? "system" : "light";
    setThemePreference(next);
    window.localStorage.setItem("accordai-theme", next);
    setDarkMode(next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  };

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
    const onScroll = (event?: Event) => {
      const target = event?.target as (HTMLElement | Document | Window | null);
      const nestedScroll = target && "scrollTop" in target ? target.scrollTop : 0;
      const pageScroll = Math.max(window.scrollY, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
      setShowBackToTop(Math.max(pageScroll, nestedScroll) > 80);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  const data = useResource(
    async () => {
      const isAccountant = user.role === "ACCOUNTANT";
      const canSeeExceptions = isAccountant || user.role === "LOCAL_ADMIN";
      const [audit, exceptions, notifications] = await Promise.all([
        getAuditLogs(user),
        canSeeExceptions ? getExceptions(user) : Promise.resolve([]),
        getNotifications().catch(() => []),
      ]);
      return {
        tenants: user.role === "SUPER_ADMIN" ? await getTenants(user) : [],
        audit,
        exceptions,
        notifications,
        pending:
          user.role === "SUPER_ADMIN"
            ? (await getCompanyRequests(user)).filter(
                (r) => r.status === "PENDING",
              ).length
            : 0,
      };
    },
    user.id,
  );

  const isAdmin = user.role === "SUPER_ADMIN";
  const isCompanyAdmin = user.role === "LOCAL_ADMIN";
  const isAccountant = user.role === "ACCOUNTANT";
  const prefix = isAdmin
    ? "admin"
    : isCompanyAdmin
      ? "company"
      : "workspace";

  // Super admin keeps the platform menu; accountants and local admins get the menu by accounting job.
  const sections: NavSection[] = isAdmin
    ? [
        { label: "Overview", items: [{ label: "Dashboard", page: "dashboard", icon: "today" }] },
        { label: "Workspace", items: adminNav.filter((item) => item[1] !== "dashboard").map(([label, page]) => ({ label, page, icon: "today" as const })) },
      ]
    : jobNavigation();
  const adminIcon = (page: string) => adminNav.find((item) => item[1] === page)?.[2] ?? LayoutDashboard;
  const homeHref = `/${prefix}/dashboard`;

  const tenant = data.data?.tenants.find((t) => t.id === user.tenantId);
  const workspaceName = isAdmin ? "AccordAI Platform" : (user.tenantName || tenant?.name || "Demo Company").split("—")[0].trim();
  const workspaceOffice = isAdmin ? "Super Admin" : ((user.tenantName || "").split("—")[1]?.trim() || "Sarawak Office");
  const notificationHref = `/${prefix}/${isAdmin ? "audit" : "exceptions"}`;
  const currentPage = pathname.split("/")[2] ?? "";
  const activeItem = activeNavItem(sections, currentPage, searchParams?.toString() ?? "");
  const activeParent = navParent(sections, activeItem);
  const activeHref = activeItem ? navHref(prefix, activeItem) : "";

  const restoredNav = useRef("");
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (isAdmin || !nav || !nav.clientHeight) return;
    const savedMenus = navMenus.get(navKey);
    if (restoredNav.current !== navKey && savedMenus && expandedMenus !== savedMenus) return;
    if (!rail && restoredNav.current !== navKey) {
      nav.scrollTop = savedNavTop(navKey);
      restoredNav.current = navKey;
    }
    if (rail) restoredNav.current = "";
    revealActive(nav);
  }, [activeHref, expandedMenus, isAdmin, navKey, open, rail]);

  const openExceptions = (data.data?.exceptions ?? []).filter(
    (e) => e.status !== "RESOLVED",
  );
  type Alert = { id: string; title: string; detail: string; href: string; time: string; notificationId?: string; read?: boolean };
  const apiNotifications = data.data?.notifications ?? [];
  const workflowAlerts: Alert[] = [...apiNotifications.map((n) => ({ id: n.id, notificationId: n.id, read: n.read, title: n.title, detail: n.message, href: n.resource ? `/${prefix}/${n.resource}` : notificationHref, time: n.createdAt })), ...openExceptions.map((e) => ({
        id: e.id,
        title: isAdmin ? (e.severity || "Exception") : "Needs fixing",
        detail: isAdmin ? (e.message || e.type || "Needs review") : ruleSentence(e.type),
        href: `/${prefix}/exceptions`,
        time: e.createdAt,
      }))].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 6)
  const alerts: Alert[] = (isAccountant || isCompanyAdmin || apiNotifications.length > 0)
    ? workflowAlerts
    : (data.data?.audit.slice(0, 4) ?? []).map((entry) => ({
        id: entry.id,
        title: entry.action.replaceAll("_", " "),
        detail: `${entry.user} · ${entry.resource}`,
        href: notificationHref,
        time: entry.timestamp,
      }));
  const alertCount = isAccountant || isCompanyAdmin
    ? apiNotifications.filter((notification) => !notification.read).length + openExceptions.length
    : alerts.length;

  return (
    <div
      className={`app-shell${pinned ? "" : " sidebar-unextended"}${darkMode ? " theme-dark" : ""}`}
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
          type="button"
          className="mobile-close icon-btn"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <button className="workspace-label" type="button" aria-label="Current workspace" title="Current workspace">
          {!isAdmin && <span className="workspace-avatar" aria-hidden="true">{workspaceName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>}
          <div>
            <strong>
              {workspaceName}
            </strong>
            <span>
              {workspaceOffice}
            </span>
          </div>
        </button>
        <nav ref={navRef} className={navScrolling ? "is-scrolling" : ""} onScroll={handleNavScroll}>
          {sections.map((section) => <div className="nav-group" key={section.label || "menu"}>
            {section.label && section.items.length > 1 && <div className="nav-group-heading">{section.label}</div>}
            {section.items.map((item) => {
              const Icon = isAdmin ? adminIcon(item.page) : NAV_ICONS[item.icon];
              const countFor = (entry: typeof item) => entry.count === "exceptions" || (isAdmin && entry.page === "exceptions")
                ? (openExceptions.length > 0 ? openExceptions.length : undefined)
                : isAdmin && entry.page === "approvals" && (data.data?.pending ?? 0) > 0
                  ? data.data?.pending
                  : undefined;
              if (item.children) {
                // A group (Sales, Bank, …): the heading toggles; the group holding the open page stays open.
                const holdsActive = activeParent === item;
                const expanded = holdsActive || expandedMenus[item.label] !== false;
                const submenuId = `nav-sub-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                // The group name opens its first page; the chevron opens or closes the group (the team's layout).
                return <div className="nav-tree-item" key={`${section.label}-${item.label}`}>
                  <div className={`nav-item-row ${holdsActive ? "active" : ""}`}>
                    <Link href={navHref(prefix, item.children[0])} onClick={() => setOpen(false)} className={`nav-item ${holdsActive ? "active" : ""}`} title={item.label}>
                      <Icon size={18} /><span>{item.label}</span>
                    </Link>
                    <button type="button" className="nav-chevron-button" aria-expanded={expanded} aria-controls={submenuId} aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
                      onClick={() => {
                        const next = { ...expandedMenus, [item.label]: !expanded };
                        navMenus.set(navKey, next);
                        setExpandedMenus(next);
                      }}>
                      <ChevronDown size={15} className={`nav-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true" />
                    </button>
                  </div>
                  {expanded && <div className="nav-submenu" id={submenuId} aria-label={`${item.label} submenu`}>
                    {item.children.map((child) => {
                      const active = activeItem === child;
                      const count = countFor(child);
                      return <Link key={child.label} href={navHref(prefix, child)} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`nav-subitem ${active ? "active" : ""}`}>
                        <span>{child.label}</span>{count !== undefined && <span className="nav-count">{count}</span>}
                      </Link>;
                    })}
                  </div>}
                </div>;
              }
              const active = activeItem === item;
              const count = countFor(item);
              return <Link key={`${section.label}-${item.label}`} href={navHref(prefix, item)} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`nav-item ${active ? "active" : ""}`} title={item.label}>
                <Icon size={18} /><span>{item.label}</span>{count !== undefined && <span className="nav-count">{count}</span>}
              </Link>;
            })}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-item"
            onClick={() => {
              setOpen(false);
              setHelpOpen(true);
            }}
          >
            <CircleHelp size={18} />
            <span>{isAdmin ? "Help & tutorial" : "Help"}</span>
          </button>
          <Link href="/login" className="nav-item">
            <LogOut size={18} />
            <span>Switch account</span>
          </Link>
          <div className="sidebar-version">
            <span>AccordAI · Accounting Intelligence</span>
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
                    router.push(homeHref);
                  }
                }}
              >
                <ArrowLeft size={17} />
              </button>
            )}
            <Link className="breadcrumb-home" href={homeHref}>
              {isAdmin ? "AccordAI Platform" : (user.tenantName || tenant?.name)}
            </Link>
            <span className="crumb-divider">/</span>
            {activeParent && <><span>{activeParent.label}</span><span className="crumb-divider">/</span></>}
            <strong>
              {activeItem?.label ?? PAGE_TITLES[currentPage] ?? (isAdmin ? "Overview" : "Dashboard")}
            </strong>
          </div>
          {!isAdmin && <GlobalSearch base={`/${prefix}`} />}
          <div className="topbar-right">
            <button type="button" className="theme-toggle btn small" aria-label={`Theme: ${themePreference}. Click to change`} title="Change theme" onClick={cycleTheme}>
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              {themePreference === "system" ? "System" : darkMode ? "Light mode" : "Dark mode"}
            </button>
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
                notifications ? "Close notifications" : "Open notifications"
              }
              aria-expanded={notifications}
              onClick={() => {
                setProfile(false);
                setNotifications(!notifications);
              }}
            >
              <Bell size={19} />
              {alertCount > 0 && (
                <span className="notification-badge" aria-label={`${alertCount} unread notifications`}>{alertCount > 99 ? "99+" : alertCount}</span>
              )}
            </button>
            {notifications && (
              <div
                className="notification-panel"
                role="dialog"
                aria-label={isAccountant ? "Exceptions" : "Latest activity"}
              >
                <div className="notification-heading">
                  <div>
                    <strong>{isAccountant ? "Needs attention" : "Latest activity"}</strong>
                    <span>
                      {isAccountant
                        ? "Open exceptions that need review"
                        : "Newest workspace updates"}
                    </span>
                  </div>
                </div>
                <div className="notification-list">
                  {alerts.length ? (
                    alerts.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="notification-item"
                        onClick={() => {
                          if (item.notificationId && !item.read) void markNotificationRead(item.notificationId);
                          setNotifications(false);
                        }}
                      >
                        <span className="notification-item-icon">
                          <ShieldCheck size={14} />
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                          {item.time && (
                            <time>
                              {new Intl.DateTimeFormat("en-MY", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(item.time))}
                            </time>
                          )}
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="notification-empty">
                      {isAccountant ? "No open exceptions." : "No new activity."}
                    </p>
                  )}
                </div>
                <Link
                  className="notification-footer"
                  href={notificationHref}
                  onClick={() => setNotifications(false)}
                >
                  {isAccountant ? "View exceptions" : "View all activity"}{" "}
                  <ArrowUpRight size={14} />
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
            <span>© 2026 Accounting Intelligence · AccordAI</span>
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
            className="back-to-top icon-btn is-available"
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
