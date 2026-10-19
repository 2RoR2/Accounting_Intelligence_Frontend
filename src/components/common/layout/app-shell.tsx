"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
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
import { getWorkspaceNavigation, type WorkspaceModule } from "@/lib/api/navigation.service";
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

const adminNav = [
  ["Dashboard", "dashboard", LayoutDashboard],
  ["All Companies", "tenants", Building2],
  ["Pending Company Requests", "approvals", ClipboardCheck],
  ["Approved / Rejected Requests", "approvals", ClipboardCheck],
  ["Suspended Companies", "tenants", Building2],
  ["Company Details", "tenants", Building2],
  ["Platform Users", "users", Users],
  ["Company Administrators", "users", Users],
  ["Account Limit Requests", "users", Users],
  ["Seat Allocation", "users", Users],
  ["Access Reviews", "users", Users],
  ["Processing Overview", "processing", ScanLine],
  ["Job Queue", "processing", ScanLine],
  ["Failed Jobs", "processing", ShieldCheck],
  ["AI Service Health", "processing", Activity],
  ["Platform Usage", "performance", ChartNoAxesCombined],
  ["Processing Performance", "performance", ChartNoAxesCombined],
  ["Extraction Quality", "performance", ChartNoAxesCombined],
  ["Failure Trends", "performance", ChartNoAxesCombined],
  ["Operational Exports", "performance", ChartNoAxesCombined],
  ["Record Overview", "records", FileCheck2],
  ["Record Metadata", "records", FileCheck2],
  ["Record Integrity", "records", FileCheck2],
  ["Support Access Requests", "records", ShieldCheck],
  ["Platform Audit Logs", "audit", Activity],
  ["Authentication Events", "audit", Activity],
  ["Permission Changes", "audit", Activity],
  ["Security Alerts", "audit", ShieldCheck],
  ["Support Access History", "audit", Activity],
  ["Service Health", "settings", Activity],
  ["Database & Storage", "settings", Settings2],
  ["Background Workers", "settings", Settings2],
  ["Backup Status", "settings", Settings2],
  ["System Notifications", "settings", Bell],
  ["Platform Configuration", "settings", Settings2],
  ["Upload Policies", "settings", Settings2],
  ["AI Provider Settings", "settings", Settings2],
  ["Email Configuration", "settings", Settings2],
  ["Default Security Policies", "settings", ShieldCheck],
  ["My Profile", "profile", UserRound],
  ["Security Settings", "profile", ShieldCheck],
  ["MFA Recovery Requests", "approvals", ShieldCheck],
] as const;

const companyNav = [
  ["Dashboard", "dashboard", LayoutDashboard],
  ["All Documents", "documents", Files],
  ["Sales Invoices", "documents", Files],
  ["Purchase Bills", "documents", Files],
  ["Receipts", "documents", Files],
  ["Credit Notes", "documents", Files],
  ["Debit Notes", "documents", Files],
  ["Upload Documents", "upload", Upload],
  ["Batch Uploads", "upload", Upload],
  ["Processing Queue", "documents", ScanLine],
  ["Failed Processing", "documents", ShieldCheck],
  ["Review Queue", "documents", ClipboardCheck],
  ["Pending Approvals", "approvals", ClipboardCheck],
  ["Returned for Correction", "documents", ClipboardCheck],
  ["Approval History", "records", FileCheck2],
  ["All Exceptions", "exceptions", ShieldCheck],
  ["Blocking Errors", "exceptions", ShieldCheck],
  ["Warnings", "exceptions", ShieldCheck],
  ["Resolved Exceptions", "exceptions", ShieldCheck],
  ["Customers", "records", Users],
  ["Suppliers", "records", Users],
  ["Contact Matching", "records", Users],
  ["All Records", "records", FileCheck2],
  ["Sales Records", "records", FileCheck2],
  ["Purchase Records", "records", FileCheck2],
  ["Record Amendments", "records", FileCheck2],
  ["Processing Reports", "reports", ChartNoAxesCombined],
  ["Validation Reports", "reports", ChartNoAxesCombined],
  ["Review Reports", "reports", ChartNoAxesCombined],
  ["Document Register", "reports", ChartNoAxesCombined],
  ["Export History", "reports", ChartNoAxesCombined],
  ["All Activities", "audit", Activity],
  ["Document Changes", "audit", Activity],
  ["Approval Actions", "audit", ClipboardCheck],
  ["User Activities", "audit", Activity],
  ["All Users", "users", Users],
  ["Invitations", "users", Users],
  ["Roles & Permissions", "users", ShieldCheck],
  ["Seat Usage", "users", Users],
  ["Workload Assignment", "users", Users],
  ["Company Profile", "settings", Building2],
  ["Validation Rules", "validation-rules", ClipboardCheck],
  ["Approval Workflow", "settings", ClipboardCheck],
  ["Notifications", "settings", Bell],
  ["Workspace Settings", "settings", Settings2],
  ["My Profile", "profile", UserRound],
  ["Security Settings", "profile", ShieldCheck],
  ["Account Limit Requests", "users", Users],
] as const;

const adminSections = [
  { label: "Company Management", icon: Building2, items: adminNav.slice(1, 6) },
  { label: "Account & Access Management", icon: Users, items: [...adminNav.slice(6, 11), adminNav[41]] },
  { label: "AI Processing", icon: ScanLine, items: adminNav.slice(11, 15) },
  { label: "Extraction Performance", icon: ChartNoAxesCombined, items: adminNav.slice(15, 20) },
  { label: "Platform Records", icon: FileCheck2, items: adminNav.slice(20, 24) },
  { label: "Reports & Analytics", icon: ChartNoAxesCombined, items: [
    ["Platform Usage", "performance", ChartNoAxesCombined],
    ["Processing Performance", "performance", ChartNoAxesCombined],
    ["Extraction Quality", "performance", ChartNoAxesCombined],
    ["Failure Trends", "performance", ChartNoAxesCombined],
    ["Operational Exports", "performance", ChartNoAxesCombined],
  ] },
  { label: "Security & Audit", icon: Activity, items: adminNav.slice(24, 29) },
  { label: "System Operations", icon: Settings2, items: adminNav.slice(29, 34) },
  { label: "System Settings", icon: Settings2, items: adminNav.slice(34, 39) },
  { label: "Account", icon: UserRound, items: adminNav.slice(39, 41) },
] as const;

const companySections = [
  { label: "Documents", icon: Files, items: companyNav.slice(1, 7) },
  { label: "Digital Shoebox", icon: Upload, items: companyNav.slice(7, 11) },
  { label: "Review & Approval", icon: ClipboardCheck, items: companyNav.slice(11, 15) },
  { label: "Exceptions", icon: ShieldCheck, items: companyNav.slice(15, 19) },
  { label: "Contacts", icon: Users, items: companyNav.slice(19, 22) },
  { label: "Standardised Records", icon: FileCheck2, items: companyNav.slice(22, 26) },
  { label: "Reports & Exports", icon: ChartNoAxesCombined, items: companyNav.slice(26, 31) },
  { label: "Audit Trail", icon: Activity, items: companyNav.slice(31, 35) },
  { label: "Team Management", icon: Users, items: [...companyNav.slice(35, 40), companyNav[47]] },
  { label: "Company Settings", icon: Settings2, items: companyNav.slice(40, 45) },
  { label: "Account", icon: UserRound, items: companyNav.slice(45, 47) },
] as const;

const accountantSections = [
  { label: "Dashboard", icon: LayoutDashboard, items: [["Dashboard", "dashboard", LayoutDashboard]] },
  { label: "Documents", icon: Files, items: [["All Documents", "documents", Files], ["Sales Invoices", "documents", Files], ["Purchase Bills", "documents", Files], ["Receipts", "documents", Files], ["Credit Notes", "documents", Files], ["Debit Notes", "documents", Files]] },
  { label: "Digital Shoebox", icon: Upload, items: [["Upload Documents", "upload", Upload], ["Processing Queue", "documents", ScanLine], ["Failed Processing", "documents", ShieldCheck]] },
  { label: "Review & Approval", icon: ClipboardCheck, items: [["My Review Queue", "documents", ClipboardCheck], ["My Submitted Approvals", "documents", ClipboardCheck], ["Returned for Correction", "documents", ClipboardCheck], ["Review History", "records", FileCheck2]] },
  { label: "Exceptions", icon: ShieldCheck, items: [["All Exceptions", "exceptions", ShieldCheck], ["Blocking Errors", "exceptions", ShieldCheck], ["Warnings", "exceptions", ShieldCheck], ["Resolved Exceptions", "exceptions", ShieldCheck]] },
  { label: "Contacts", icon: Users, items: [["Customers", "contacts", Users], ["Suppliers", "contacts", Users], ["Contact Matching", "contacts", Users]] },
  { label: "Standardised Records", icon: FileCheck2, items: [["All Records", "records", FileCheck2], ["Sales Records", "records", FileCheck2], ["Purchase Records", "records", FileCheck2], ["Record Amendments", "records", FileCheck2]] },
  { label: "Reports & Exports", icon: ChartNoAxesCombined, items: [["Processing Reports", "reports", ChartNoAxesCombined], ["Validation Reports", "reports", ChartNoAxesCombined], ["Review Reports", "reports", ChartNoAxesCombined], ["Document Register", "reports", ChartNoAxesCombined], ["Export History", "reports", ChartNoAxesCombined]] },
  { label: "Audit Trail", icon: Activity, items: [["All Activities", "reports", Activity], ["Document Changes", "reports", Activity], ["Approvals", "reports", Activity], ["Security Events", "reports", Activity]] },
  { label: "Control Panel", icon: Settings2, items: [["Notifications", "profile", Bell], ["My Profile", "profile", UserRound], ["Settings", "profile", Settings2]] },
] as const;

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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Dashboard: true,
  });
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
      navigation: await getWorkspaceNavigation(user).catch(() => [] as WorkspaceModule[]),
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
  const prefix = isAdmin
    ? "admin"
    : user.role === "LOCAL_ADMIN"
      ? "company"
      : "workspace";
  const roleSections = isAdmin ? adminSections : companySections;
  const navigationSections = useMemo(() => {
    const modules = data.data?.navigation ?? [];
    if (!modules.length || user.role === "ACCOUNTANT") return null;

    const iconMap = {
      dashboard: LayoutDashboard,
      documents: Files,
      upload: Upload,
      processing: ScanLine,
      failed: ShieldCheck,
      review: ClipboardCheck,
      approval: ClipboardCheck,
      exceptions: ShieldCheck,
      contacts: Users,
      records: FileCheck2,
      reports: ChartNoAxesCombined,
      audit: Activity,
      users: Users,
      settings: Settings2,
      profile: UserRound,
      companies: Building2,
      performance: ChartNoAxesCombined,
      health: Activity,
      folder: Files,
    } as const;
    const groups = new Map<string, Array<readonly [string, string, typeof Files]>>();
    for (const workspaceModule of modules) {
      const Icon = iconMap[workspaceModule.icon as keyof typeof iconMap] ?? Files;
      const items = groups.get(workspaceModule.section) ?? [];
      items.push([workspaceModule.label, workspaceModule.route, Icon] as const);
      groups.set(workspaceModule.section, items);
    }
    return Array.from(groups, ([label, items]) => ({
      label,
      icon: items[0]?.[2] ?? Files,
      items,
    }));
  }, [data.data?.navigation, user.role]);
  const effectiveRoleSections = navigationSections ?? roleSections;
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
            className={`sidebar-pin${rail ? " sidebar-pin-outside" : ""}`}
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
                : user.role === "LOCAL_ADMIN"
                  ? "Company Admin"
                  : "Accountant"}
            </span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {user.role === "ACCOUNTANT" ? accountantSections.map((section) => {
            const SectionIcon = section.icon;
            if (section.label === "Dashboard") {
              return (
                <Link
                  key="accountant-dashboard"
                  href={`/${prefix}/dashboard`}
                  aria-current={currentPage === "dashboard" ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`nav-item ${currentPage === "dashboard" ? "active" : ""}`}
                  title="Dashboard"
                >
                  <SectionIcon size={17} />
                  <span>Dashboard</span>
                </Link>
              );
            }
            return (
            <div className="nav-section" key={section.label}>
              <button
                type="button"
                className="nav-section-label"
                aria-expanded={expandedSections[section.label] ?? false}
                onClick={() => {
                  setExpandedSections((current) => ({
                    ...current,
                    [section.label]: true,
                  }));
                  const firstItem = section.items[0];
                  const firstIsUpload = firstItem[0] === "Upload Documents";
                  router.push(firstIsUpload ? `/${prefix}/upload` : `/${prefix}/${firstItem[1]}/view-${firstItem[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
                }}
              >
                <SectionIcon className="nav-section-icon" size={16} aria-hidden="true" />
                <span>{section.label}</span>
                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  className={expandedSections[section.label] ? "nav-section-chevron expanded" : "nav-section-chevron"}
                />
              </button>
              {expandedSections[section.label] && section.items.map(([label, path, Icon]) => {
                const documentTab = label === "All Documents" ? "all" : label === "Sales Invoices" ? "sales-invoices" : label === "Purchase Bills" ? "purchase-bills" : label === "Receipts" ? "receipts" : label === "Credit Notes" ? "credit-notes" : label === "Debit Notes" ? "debit-notes" : "";
                const uploadItem = label === "Upload Documents";
                const profileItem = label === "My Profile";
                const reportItem = path === "reports";
                const auditItem = section.label === "Audit Trail";
                const reportTab = auditItem ? "audit" : label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                const itemHref = uploadItem || profileItem
                  ? `/${prefix}/${uploadItem ? "upload" : "profile"}`
                  : reportItem || auditItem
                  ? `/${prefix}/reports?tab=${reportTab}`
                  : documentTab
                  ? `/${prefix}/documents${documentTab === "all" ? "" : `?tab=${documentTab}`}`
                  : `/${prefix}/${path}/view-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                const itemActive = uploadItem || profileItem
                  ? pathname === `/${prefix}/${uploadItem ? "upload" : "profile"}`
                  : reportItem || auditItem
                  ? pathname === `/${prefix}/reports` && searchParams.get("tab") === reportTab
                  : documentTab
                  ? pathname === `/${prefix}/documents` && (searchParams.get("tab") || "all") === documentTab
                  : pathname === itemHref;

                return (
                  <Link
                    key={`${section.label}-${label}`}
                    href={itemHref}
                    aria-current={itemActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`nav-item nav-subitem ${itemActive ? "active" : ""}`}
                    title={label}
                  >
                    <Icon size={17} /><span>{label}</span>
                  </Link>
                );
              })}
            </div>
          );
          }) : <>
            <Link
              href={`/${prefix}/dashboard`}
              aria-current={currentPage === "dashboard" ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`nav-item ${currentPage === "dashboard" ? "active" : ""}`}
              title="Dashboard"
            >
              <LayoutDashboard size={18} /><span>Dashboard</span>
            </Link>
            {effectiveRoleSections.map((section) => {
            const SectionIcon = section.icon;
            const expanded = expandedSections[section.label] ?? false;
            return <div className="nav-section role-navigation" key={section.label}>
              <button type="button" className="nav-section-label" aria-expanded={expanded} onClick={() => setExpandedSections((current) => ({ ...current, [section.label]: !expanded }))}>
                <SectionIcon className="nav-section-icon" size={16} /><span>{section.label}</span><ChevronDown size={15} className={expanded ? "nav-section-chevron expanded" : "nav-section-chevron"} />
              </button>
              {expanded && section.items.map(([label, path, Icon], i) => {
                // Local Admin approval items use the existing tenant review page;
                // Super Admin approvals has its own protected route.
                const resolvedPath = !isAdmin && path === "approvals" ? "documents" : path;
                const active = currentPage === resolvedPath;
                return <Link key={`${section.label}-${label}`} href={`/${prefix}/${resolvedPath}`} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`nav-item nav-subitem ${active ? "active" : ""} ${i === section.items.length - 1 && section.label === "Account" ? "nav-separator" : ""}`} title={label}>
                  <Icon size={17} /><span>{label}</span>{path === "approvals" && !!data.data?.pending && <span className="nav-count">{data.data.pending}</span>}
                </Link>;
              })}
            </div>;
            })}
          </>}
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
                  // A direct visit has no useful in-app destination. In that
                  // case, return to the current workspace dashboard instead
                  // of leaving the application through browser history.
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
