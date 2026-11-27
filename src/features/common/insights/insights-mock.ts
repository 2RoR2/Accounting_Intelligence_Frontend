/**
 * Synthetic insights responses, in the shape the backend returns (docs/api/insights-reports.md). Used only when
 * NEXT_PUBLIC_INSIGHTS_MOCK=1 (local design work without a backend) and by the tests. Never shipped as live data.
 */
const cents = (value: number) => value.toFixed(2);

// [key, label, from, to, receivables, payables, receivableCount, payableCount]
const BUCKETS: Array<[string, string, string | null, string | null, number, number, number, number]> = [
  ["overdue", "Already due", null, "2026-11-27", 3150, 4620.5, 2, 3],
  ["d1_30", "1-30 days", "2026-11-28", "2026-12-27", 16550, 17350, 6, 7],
  ["d31_60", "31-60 days", "2026-12-28", "2027-01-26", 9800, 12740.25, 4, 5],
  ["d61_90", "61-90 days", "2027-01-27", "2027-02-25", 5200, 3980, 2, 2],
  ["later", "After 90 days", "2027-02-26", null, 2400, 0, 1, 0],
];

export function mockOverview(period: string) {
  const opening = 38250;
  const sum = (index: number, field: 4 | 5) => BUCKETS.slice(0, index + 1).reduce((total, bucket) => total + bucket[field], 0);
  const horizon = (days: number, date: string, index: number) => {
    const receivables = sum(index, 4);
    const payables = sum(index, 5);
    return { days, date, receivablesDue: cents(receivables), payablesDue: cents(payables), net: cents(receivables - payables), projectedBalance: cents(opening + receivables - payables) };
  };
  return {
    period,
    fromDate: `${period}-01`,
    toDate: "2026-11-27",
    asOf: "2026-11-27",
    currency: "MYR",
    generatedAt: "2026-11-27T02:30:00+00:00",
    forecast: {
      kind: "projection",
      basis: "Projection from recorded due dates: the bank and cash balance today, plus open invoices and minus open bills by the due date on each. It is not a prediction of when anything is paid.",
      asOf: "2026-11-27",
      openingBalance: cents(opening),
      bankAccounts: [{ accountId: "b1", code: "1010", name: "Maybank Current", balance: cents(opening) }],
      buckets: BUCKETS.map(([key, label, from, to, receivables, payables, receivableCount, payableCount]) => ({
        key, label, from, to, receivables: cents(receivables), payables: cents(payables), net: cents(receivables - payables), receivableCount, payableCount,
      })),
      noDueDate: {
        receivables: "1250.00", payables: "860.50", receivableCount: 1, payableCount: 2,
        note: "These open items have no recorded due date, so they are not in the forecast.",
      },
      horizons: [horizon(30, "2026-12-27", 1), horizon(60, "2027-01-26", 2), horizon(90, "2027-02-25", 3)],
      totals: { openReceivables: "38350.00", openPayables: "39551.25" },
    },
    spendBySupplier: {
      total: "33716.45",
      items: [
        { name: "Seladah Hardware Sdn Bhd", amount: "12410.00", share: "36.81", entries: 14, isOther: false },
        { name: "Meranti Paints Trading", amount: "9120.50", share: "27.05", entries: 9, isOther: false },
        { name: "Tenaga Nasional Berhad", amount: "4310.00", share: "12.78", entries: 1, isOther: false },
        { name: "Kuching Logistics", amount: "3875.75", share: "11.50", entries: 5, isOther: false },
        { name: "Borneo Office Supplies", amount: "2240.00", share: "6.64", entries: 3, isOther: false },
        { name: "Other suppliers and costs", amount: "1760.20", share: "5.22", entries: 4, isOther: true },
      ],
    },
    spendByCategory: {
      total: "33716.45",
      items: [
        { accountId: "a-5000", code: "5000", name: "Purchases", amount: "21530.50", share: "63.86", isOther: false },
        { accountId: "a-6100", code: "6100", name: "Utilities", amount: "4310.00", share: "12.78", isOther: false },
        { accountId: "a-6200", code: "6200", name: "Freight and delivery", amount: "3875.75", share: "11.50", isOther: false },
        { accountId: "a-6300", code: "6300", name: "Office supplies", amount: "2240.00", share: "6.64", isOther: false },
        { accountId: null, code: null, name: "Other accounts", amount: "1760.20", share: "5.22", isOther: true },
      ],
    },
    trend: {
      months: [
        { month: "2026-06", fromDate: "2026-06-01", toDate: "2026-06-30", revenue: "41200.00", expenses: "29850.00", net: "11350.00", partial: false },
        { month: "2026-07", fromDate: "2026-07-01", toDate: "2026-07-31", revenue: "44850.00", expenses: "31020.00", net: "13830.00", partial: false },
        { month: "2026-08", fromDate: "2026-08-01", toDate: "2026-08-31", revenue: "39600.00", expenses: "30410.00", net: "9190.00", partial: false },
        { month: "2026-09", fromDate: "2026-09-01", toDate: "2026-09-30", revenue: "47300.00", expenses: "33780.00", net: "13520.00", partial: false },
        { month: "2026-10", fromDate: "2026-10-01", toDate: "2026-10-31", revenue: "43150.00", expenses: "35260.00", net: "7890.00", partial: false },
        { month: "2026-11", fromDate: "2026-11-01", toDate: "2026-11-27", revenue: "46900.00", expenses: "38420.00", net: "8480.00", partial: true },
      ],
    },
    anomalies: [
      {
        id: "a1", kind: "supplier", subject: "Seladah Hardware Sdn Bhd", metric: "spend", month: "2026-10",
        value: "6980.00", median: "1500.00", lower: "0.00", upper: "3100.00", direction: "high", score: "5.8", basis: "own_history",
        reason: "Seladah Hardware Sdn Bhd spend of RM 6,980.00 in Oct 2026 is far above its usual RM 1,500.00 (expected range RM 0.00 to RM 3,100.00).",
      },
      {
        id: "a2", kind: "month", subject: "Nov 2026", metric: "expenses", month: "2026-11",
        value: "38420.00", median: "31020.00", lower: "27100.00", upper: "35400.00", direction: "high", score: "4.1", basis: "months",
        reason: "Expenses of RM 38,420.00 in Nov 2026 is higher than the usual RM 31,020.00 (expected range RM 27,100.00 to RM 35,400.00).",
      },
    ],
    anomalyMethod: "Robust band: median plus or minus 3.5 / 0.6745 x MAD (modified z-score 3.5, as in EX-010). Needs at least 5 earlier points.",
  };
}

export function mockCommentary(period: string, options: { fallback?: boolean; reason?: string } = {}) {
  const fallback = options.fallback === true;
  return {
    period,
    fromDate: `${period}-01`,
    toDate: "2026-11-27",
    asOf: "2026-11-27",
    paragraphs: [
      {
        text: "Sales were RM 46,900.00 in November 2026, up RM 3,750.00 on October 2026, while expenses were RM 38,420.00, up RM 3,160.00.",
        factIds: ["f1", "f2", "f3"],
      },
      {
        text: "Most of the extra spend came from Seladah Hardware Sdn Bhd, at RM 12,410.00, and one October bill from this supplier was flagged as unusually large.",
        factIds: ["f4", "f5"],
      },
      {
        text: "Payables due in the next 30 days are RM 17,350.00 against RM 16,550.00 of receivables, so the projected cash position falls slightly.",
        factIds: ["f6", "f7"],
      },
    ],
    facts: [
      { id: "f1", label: "Sales, November 2026", value: "46900.00", unit: "MYR", display: "RM 46,900.00", href: "/reports/profit-and-loss?fromDate=2026-11-01&toDate=2026-11-27" },
      { id: "f2", label: "Expenses, November 2026", value: "38420.00", unit: "MYR", display: "RM 38,420.00", href: "/reports/profit-and-loss?fromDate=2026-11-01&toDate=2026-11-27" },
      { id: "f3", label: "Net result, November 2026", value: "8480.00", unit: "MYR", display: "RM 8,480.00", href: "/reports/profit-and-loss?fromDate=2026-11-01&toDate=2026-11-27" },
      { id: "f4", label: "Seladah Hardware spend", value: "12410.00", unit: "MYR", display: "RM 12,410.00", href: "/reports/profit-and-loss?fromDate=2026-11-01&toDate=2026-11-27" },
      { id: "f5", label: "Flagged bills", value: "1", unit: "count", display: "1", href: null },
      { id: "f6", label: "Payables, overdue and open", value: "17350.00", unit: "MYR", display: "RM 17,350.00", href: "/reports/ageing?type=payables&asOf=2026-11-27" },
      { id: "f7", label: "Receivables, overdue and open", value: "16550.00", unit: "MYR", display: "RM 16,550.00", href: "/reports/ageing?type=receivables&asOf=2026-11-27" },
    ],
    generatedAt: "2026-11-27T02:31:00+00:00",
    fallback,
    fallbackReason: fallback ? options.reason ?? "provider_unavailable" : null,
    label: fallback
      ? "Template text, not AI. Every figure is a posted-record figure."
      : "AI draft commentary. Check it against the figures before you send it.",
    cached: false,
    partialPeriod: true,
  };
}
