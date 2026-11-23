import Link from "next/link";
import "@/styles/document-tabs.css";

export interface TabBarItem { key: string; label: string; href: string; current: boolean; count?: number }

/**
 * A horizontal tab bar made of links: each tab is its own URL, so links, reloads and the browser back button work.
 * Used for the type tabs on All documents and the lane tabs on To review.
 */
export function DocumentTabBar({ label, tabs }: { label: string; tabs: TabBarItem[] }) {
  return (
    <nav className="workspace-tabs document-list-tabs doc-tab-bar" aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.current ? "active" : ""} aria-current={tab.current ? "page" : undefined}>
          {tab.label}
          {tab.count !== undefined && <span className="doc-tab-count">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
