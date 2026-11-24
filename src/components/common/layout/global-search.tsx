"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDate, money } from "@/components/common/ui";
import { recordHref, typeLabel } from "@/features/common/trace/trace-links";
import { globalSearch, type SearchGroup, type SearchItem } from "@/lib/api/trace.service";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

/** True when the key press happened while the user is typing into a field, so "/" must stay a normal character. */
function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * Top-bar search: a record's number, a contact's name, a reference or an exact amount. Results come grouped by type
 * (backend `GET /api/search`), at most five per type, each linking to the record.
 * Keys: Ctrl/Cmd+K or "/" focuses it from anywhere; arrows move; Enter opens the highlighted result (or the first one);
 * Esc closes. On a phone it collapses to an icon that expands over the top bar.
 */
export function GlobalSearch({ base }: { base: string }) {
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const latest = useRef(0);
  const enterWhenReady = useRef(false);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mac, setMac] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [searched, setSearched] = useState("");
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const query = text.trim();
  const ready = query.length >= MIN_CHARS;

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const current = ready && searched === query;
  const optionId = (index: number) => `${listId}-option-${index}`;

  const close = () => { setOpen(false); setExpanded(false); enterWhenReady.current = false; };
  const go = (item: SearchItem) => {
    const href = recordHref(base, item);
    if (!href) return;
    close();
    field.current?.blur();
    router.push(href);
  };

  useEffect(() => { setMac(/Mac|iPhone|iPad/i.test(navigator.userAgent)); }, []);

  useEffect(() => {
    if (!ready) return;
    const request = ++latest.current;
    const timer = window.setTimeout(() => {
      globalSearch(query)
        .then((result) => {
          if (request !== latest.current) return;
          setGroups(result.groups);
          setSearched(result.query);
          setError("");
          setActive(-1);
        })
        .catch((e: unknown) => {
          if (request !== latest.current) return;
          setGroups([]);
          setSearched(query);
          setError(e instanceof Error ? e.message : "Search is unavailable right now.");
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, ready]);

  // Enter pressed while the answer was still on its way: open the first result as soon as it arrives.
  useEffect(() => {
    if (!enterWhenReady.current || !current) return;
    enterWhenReady.current = false;
    if (!error && flat.length) go(flat[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, error, flat]);

  useEffect(() => {
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) close(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  // Ctrl/Cmd+K and "/" jump to the search from anywhere on the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = (event.key === "k" || event.key === "K") && (event.ctrlKey || event.metaKey);
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target);
      if (!shortcut && !slash) return;
      event.preventDefault();
      setExpanded(true);
      setOpen(true);
      window.requestAnimationFrame(() => { field.current?.focus(); field.current?.select(); });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const activeId = open && current && active >= 0 ? optionId(active) : undefined;
  const shortcutLabel = mac ? "⌘ K" : "Ctrl K";

  return <div className={`global-search${expanded ? " is-expanded" : ""}`} role="search" ref={box}>
    <button
      type="button"
      className="global-search-toggle icon-btn"
      aria-label="Search records"
      aria-expanded={expanded}
      onClick={() => { setExpanded(true); setOpen(true); window.requestAnimationFrame(() => field.current?.focus()); }}
    >
      <Search size={18} aria-hidden="true" />
    </button>
    <label className="global-search-field">
      <Search size={16} aria-hidden="true" />
      <input
        ref={field}
        type="search"
        role="combobox"
        placeholder="Search records…"
        title="Search by number, contact, reference or amount"
        aria-label="Search by number, contact, reference or amount"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        autoComplete="off"
        enterKeyHint="search"
        value={text}
        onChange={(event) => { setText(event.target.value); setActive(-1); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); return; }
          if (event.key === "Enter") {
            if (!ready) return;
            event.preventDefault();
            if (!current || error) { enterWhenReady.current = true; return; }
            const item = flat[active >= 0 ? active : 0];
            if (item) go(item);
            return;
          }
          if (!flat.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((n) => (n + 1) % flat.length); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((n) => (n <= 0 ? flat.length - 1 : n - 1)); }
        }}
      />
      {text
        ? <button type="button" className="global-search-clear" aria-label="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={() => { setText(""); setGroups([]); setSearched(""); setActive(-1); field.current?.focus(); }}>
          <X size={14} aria-hidden="true" />
        </button>
        : <kbd className="global-search-kbd" aria-hidden="true">{shortcutLabel}</kbd>}
    </label>
    {open && <div className="global-search-results" id={listId} role="listbox" aria-label="Search results" aria-live="polite">
      {query.length === 0 && <p className="global-search-note">Search by number, contact, reference or exact amount. Press <kbd>/</kbd> or <kbd>{shortcutLabel}</kbd> to search from anywhere.</p>}
      {query.length > 0 && !ready && <p className="global-search-note">Type at least {MIN_CHARS} characters.</p>}
      {ready && !current && !error && <p className="global-search-note">Searching…</p>}
      {ready && error && <p className="global-search-note" role="alert">{error}</p>}
      {current && !error && groups.length === 0 && <p className="global-search-note">No matches for “{query}”.</p>}
      {current && !error && groups.map((group) => <section className="global-search-group" key={group.group} aria-label={group.label}>
        <h3>{group.label}</h3>
        <ul role="presentation">
          {group.items.map((item) => {
            const index = flat.indexOf(item);
            const href = recordHref(base, item);
            const body = <>
              <span className="global-search-main">
                <strong>{item.number}</strong>
                <small>{[item.title, item.date ? formatDate(item.date) : null, typeLabel(item.kind, item.type)].filter(Boolean).join(" · ")}</small>
              </span>
              {item.amount !== null && <span className="global-search-amount">{money(item.amount)}</span>}
            </>;
            return <li key={`${item.kind}:${item.id}`} role="presentation">
              {href
                ? <Link id={optionId(index)} role="option" aria-selected={index === active} className="global-search-item" href={href} data-active={index === active} onMouseMove={() => { if (index !== active) setActive(index); }} onClick={() => { setOpen(false); setExpanded(false); }}>{body}</Link>
                : <span id={optionId(index)} role="option" aria-selected={index === active} aria-disabled="true" className="global-search-item">{body}</span>}
            </li>;
          })}
        </ul>
      </section>)}
      {current && !error && flat.length > 0 && <p className="global-search-foot" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</p>}
    </div>}
  </div>;
}
