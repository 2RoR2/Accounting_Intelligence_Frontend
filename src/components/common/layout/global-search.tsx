"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDate, money } from "@/components/common/ui";
import { recordHref, typeLabel } from "@/features/common/trace/trace-links";
import { globalSearch, type SearchGroup, type SearchItem } from "@/lib/api/trace.service";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

/**
 * Top-bar search: a record's number, a contact's name, a reference or an exact amount. Results come grouped by type
 * (backend `GET /api/search`), at most five per type, each linking to the record. Arrow keys move, Enter opens, Esc closes.
 */
export function GlobalSearch({ base }: { base: string }) {
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(0);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [searched, setSearched] = useState("");
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const query = text.trim();
  const ready = query.length >= MIN_CHARS;

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

  useEffect(() => {
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const go = (item: SearchItem) => {
    const href = recordHref(base, item);
    if (!href) return;
    setOpen(false);
    router.push(href);
  };
  const current = ready && searched === query;

  return <div className="global-search" role="search" ref={box}>
    <label className="global-search-field">
      <Search size={15} aria-hidden="true" />
      <input
        type="search"
        placeholder="Search number, contact, reference or amount"
        aria-label="Search records"
        aria-controls={listId}
        autoComplete="off"
        value={text}
        onChange={(event) => { setText(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); return; }
          if (!flat.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((n) => (n + 1) % flat.length); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((n) => (n <= 0 ? flat.length - 1 : n - 1)); }
          else if (event.key === "Enter" && active >= 0) { event.preventDefault(); go(flat[active]); }
        }}
      />
    </label>
    {open && query.length > 0 && <div className="global-search-results" id={listId} aria-live="polite">
      {!ready && <p className="global-search-note">Type at least {MIN_CHARS} characters.</p>}
      {ready && !current && !error && <p className="global-search-note">Searching…</p>}
      {ready && error && <p className="global-search-note" role="alert">{error}</p>}
      {current && !error && groups.length === 0 && <p className="global-search-note">No matches for “{query}”.</p>}
      {current && !error && groups.map((group) => <section className="global-search-group" key={group.group} aria-label={group.label}>
        <h3>{group.label}</h3>
        <ul>
          {group.items.map((item) => {
            const index = flat.indexOf(item);
            const href = recordHref(base, item);
            const body = <>
              <span>
                <strong>{item.number}</strong>
                <small>{[item.title, item.date ? formatDate(item.date) : null, typeLabel(item.kind, item.type)].filter(Boolean).join(" · ")}</small>
              </span>
              {item.amount !== null && <span className="global-search-amount">{money(item.amount)}</span>}
            </>;
            return <li key={`${item.kind}:${item.id}`}>
              {href
                ? <Link className="global-search-item" href={href} data-active={index === active} onClick={() => setOpen(false)}>{body}</Link>
                : <span className="global-search-item">{body}</span>}
            </li>;
          })}
        </ul>
      </section>)}
    </div>}
  </div>;
}
