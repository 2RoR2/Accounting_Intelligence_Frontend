"use client";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
export function Badge({ children }: { children: ReactNode }) {
  const value = String(children);
  const tone =
    /ACTIVE|PASS|COMPLETED|APPROVED|VALIDATED|RESOLVED|HIGH CONFIDENCE/.test(
      value,
    )
      ? "green"
      : /FAIL|REJECT|SUSPEND|DISABLED|HIGH$/.test(value)
        ? "red"
        : /PENDING|INVITED|EXCEPTION|LOW|WARNING|REVIEW|CORRECTED/.test(value)
          ? "amber"
          : "neutral";
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon ?? <ArrowUpRight size={17} />}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        <span className="trend">
          <ArrowUpRight size={13} /> Live
        </span>
        <span>{detail ?? "in this workspace"}</span>
      </div>
    </div>
  );
}
export function EmptyState({
  message = "No results match your filters.",
  action,
}: {
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Search size={28} />
      <h3>Nothing here yet</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-orb" aria-hidden="true" />
      <strong>Preparing your workspace</strong>
      <span>Loading Accounting Intelligence…</span>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error-box">
      <strong>We couldn’t complete that request.</strong>
      <p>{message}</p>
      {retry && (
        <button className="btn" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All {label.toLowerCase()}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
}
export function DataTable<T>({
  columns,
  rows,
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const current = Math.min(page, pages - 1);
  return (
    <>
      <div
        className="table-scroll"
        role="region"
        aria-label="Data table"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  scope="col"
                  className={
                    /^Actions?$/.test(c.label) ? "table-action-cell" : undefined
                  }
                  key={c.label}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 8, current * 8 + 8).map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td
                    className={
                      /^Actions?$/.test(c.label)
                        ? "table-action-cell"
                        : undefined
                    }
                    key={c.label}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <EmptyState />}
      </div>
      <div className="pagination">
        <span>
          {rows.length
            ? `${current * 8 + 1}–${Math.min(current * 8 + 8, rows.length)}`
            : "0"}{" "}
          of {rows.length} results
        </span>
        <div>
          <button
            aria-label="Previous page"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            aria-label="Next page"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  const required = label.trimEnd().endsWith("*");
  const labelText = required ? label.trimEnd().slice(0, -1).trimEnd() : label;
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {labelText}
        {required && (
          <span className="field-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
        ? cloneElement(children, {
            id: fieldId,
            "aria-describedby": hint ? `${fieldId}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${fieldId}-hint`}>{hint}</small>}
    </div>
  );
}
export function AccountUsage({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="account-usage">
      <div>
        <strong>
          {used} / {limit}
        </strong>
        <span> accounts used / reserved</span>
      </div>
      <div className="progress-track">
        <div style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
      </div>
      <small>
        {Math.max(0, limit - used)} available · Pending invitations reserve a
        seat
      </small>
    </div>
  );
}
export function Toast({ message }: { message: string }) {
  return message ? (
    <div className="toast" role="status">
      <Check size={18} />
      {message}
    </div>
  ) : null;
}
export const ExportIcon = () => <ArrowDownToLine size={16} />;
export const formatDate = (date: string) =>
  date === "—"
    ? "—"
    : new Intl.DateTimeFormat("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(date));
export const money = (value: string | number) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    Number(value),
  );
