import type {
  Database,
  DocumentKind,
  Extraction,
  RecordCategory,
  User,
  ValidationRules,
} from "@/types";
export const defaultRules: ValidationRules = {
  supplier: true,
  invoice: true,
  date: true,
  total: true,
  duplicate: true,
  threshold: 80,
};
export function documentKindFromName(name: string): DocumentKind {
  if (/receipt/i.test(name)) return "RECEIPT";
  if (/bill/i.test(name)) return "BILL";
  return "INVOICE";
}
export function labelForKind(kind: DocumentKind) {
  if (kind === "RECEIPT") return "Receipt";
  if (kind === "BILL") return "Bill";
  return "Invoice";
}
export function documentTypeFromName(name: string) {
  return labelForKind(documentKindFromName(name));
}
export function nextDocumentCode(existingIds: string[], kind: DocumentKind) {
  const numbers = existingIds.flatMap((id) => {
    const match = id.match(new RegExp(`^${kind}_(\\d+)$`));
    return match ? [Number(match[1])] : [];
  });
  const next = (numbers.length ? Math.max(...numbers) : 100000) + 1;
  return `${kind}_${next}`;
}
export function makeExtraction(
  documentId: string,
  scenario = "success",
  company = "ABC Sdn Bhd",
  documentType = "Invoice",
  submittedAt = "2026-09-15T11:05:00+08:00",
  category: RecordCategory = "ACCOUNTS_PAYABLE",
): Extraction {
  const issuedAt = "2026-09-15T10:30:00+08:00";
  const validatedAt = "2026-09-15T11:06:42+08:00";
  const values: Record<string, [string, string, number]> = {
    type: ["Document Type", documentType, 99],
    accountingCategory: [
      "Accounting Category",
      category === "ACCOUNTS_RECEIVABLE"
        ? "Accounts Receivable"
        : "Accounts Payable",
      100,
    ],
    supplier: [
      "Supplier Name",
      category === "ACCOUNTS_RECEIVABLE"
        ? company
        : "Atlas Office Supplies Sdn Bhd",
      98,
    ],
    supplierAddress: [
      "Supplier Address",
      category === "ACCOUNTS_RECEIVABLE"
        ? "Level 18, Menara Sentral, Kuala Lumpur Sentral, 50470 Kuala Lumpur, Malaysia"
        : "12, Jalan Industri, 47300 Petaling Jaya, Selangor, Malaysia",
      97,
    ],
    registration: ["Supplier Registration Number", "201901024891", 97],
    invoice: [
      "Invoice Number",
      scenario === "missing"
        ? ""
        : scenario === "duplicate"
          ? "INV-2026-00821"
          : `INV-2026-${documentId.slice(-4)}`,
      99,
    ],
    date: ["Issuance Date", "2026-09-15", 98],
    issuanceDateTime: ["Issuance Date & Time", issuedAt, 98],
    submissionDateTime: ["Submission Date & Time", submittedAt, 99],
    validationDateTime: ["Validation Date & Time", validatedAt, 99],
    due: ["Due Date", "2026-10-15", 96],
    reference: [
      "Reference / PO Number",
      "PO-2192",
      scenario === "low" || scenario === "mismatch" ? 72 : 96,
    ],
    customer: [
      "Buyer Name",
      category === "ACCOUNTS_RECEIVABLE" ? "Meridian Group Sdn Bhd" : company,
      99,
    ],
    buyerAddress: [
      "Buyer Address",
      category === "ACCOUNTS_RECEIVABLE"
        ? "8, Jalan Sultan Ismail, 50250 Kuala Lumpur, Malaysia"
        : "Level 18, Menara Sentral, Kuala Lumpur Sentral, 50470 Kuala Lumpur, Malaysia",
      96,
    ],
    currency: ["Currency", "MYR", 100],
    subtotal: ["Subtotal", "800.00", 98],
    tax: ["Tax Amount", "48.00", 98],
    discount: ["Discount", "0.00", 99],
    total: [
      "Total Payable Amount",
      scenario === "mismatch" ? "8480.00" : "848.00",
      scenario === "mismatch" ? 76 : 99,
    ],
    paymentDetails: [
      "Payment Details",
      "Bank transfer · Maybank · Account 5140 2288 9012 · Reference PO-2192",
      95,
    ],
  };
  return {
    documentId,
    fields: Object.fromEntries(
      Object.entries(values).map(([key, [label, value, confidence]]) => [
        key,
        { label, value, original: value, confidence },
      ]),
    ),
    lineItems: [
      {
        description: "A4 copy paper · 80 gsm",
        quantity: 10,
        unitPrice: 35,
        amount: 350,
      },
      {
        description: "Printer toner cartridge",
        quantity: 3,
        unitPrice: 150,
        amount: 450,
      },
    ],
  };
}
export function seedDatabase(): Database {
  const users: User[] = [
    {
      id: "USR-001",
      name: "SAIC Administrator",
      email: "admin@saic.example",
      role: "SUPER_ADMIN",
      tenantId: null,
      status: "ACTIVE",
      invitedBy: "SAIC",
      invitedAt: "2026-08-01",
      lastLogin: "2026-09-17T08:00:00",
    },
    ...[
      [
        "USR-002",
        "Alice Tan",
        "alice@abc.example",
        "LOCAL_ADMIN",
        "TENANT_001",
        "ACTIVE",
        "SAIC",
      ],
      [
        "USR-003",
        "Rachel Chong",
        "rachel@abc.example",
        "ACCOUNTANT",
        "TENANT_001",
        "ACTIVE",
        "Alice Tan",
      ],
      [
        "USR-004",
        "John Lee",
        "john@abc.example",
        "ACCOUNTANT",
        "TENANT_001",
        "INVITED",
        "Alice Tan",
      ],
      [
        "USR-005",
        "David Wong",
        "david@xyz.example",
        "LOCAL_ADMIN",
        "TENANT_002",
        "ACTIVE",
        "SAIC",
      ],
      [
        "USR-006",
        "Sarah Lim",
        "sarah@xyz.example",
        "ACCOUNTANT",
        "TENANT_002",
        "ACTIVE",
        "David Wong",
      ],
      [
        "USR-007",
        "Marcus Chan",
        "marcus@abc.example",
        "ACCOUNTANT",
        "TENANT_001",
        "ACTIVE",
        "Alice Tan",
      ],
      [
        "USR-008",
        "Priya Kumar",
        "priya@abc.example",
        "ACCOUNTANT",
        "TENANT_001",
        "ACTIVE",
        "Alice Tan",
      ],
      [
        "USR-009",
        "Daniel Ng",
        "daniel@abc.example",
        "ACCOUNTANT",
        "TENANT_001",
        "ACTIVE",
        "Alice Tan",
      ],
      [
        "USR-010",
        "Jia Wen",
        "jia@abc.example",
        "ACCOUNTANT",
        "TENANT_001",
        "INVITED",
        "Alice Tan",
      ],
    ].map(([id, name, email, role, tenantId, status, invitedBy]) => ({
      id,
      name,
      email,
      role: role as User["role"],
      tenantId,
      status: status as User["status"],
      invitedBy,
      invitedAt: "2026-09-10",
      lastLogin: status === "ACTIVE" ? "2026-09-17T07:42:00" : "—",
      mustChangePassword: role === "ACCOUNTANT" && status === "ACTIVE",
    })),
  ];
  const sourceNames = [
    "INV-2026-00821.pdf",
    "Atlas-invoice-0822.pdf",
    "September-receipt.jpg",
    "Office-supplies.pdf",
    "Invoice-copy.pdf",
    "Damaged-scan.pdf",
    "Consulting-fees.pdf",
    "Monthly-bill.pdf",
  ];
  const assignedCodes: string[] = [];
  const documents: Database["documents"] = Array.from(
    { length: 16 },
    (_, i) => {
      const scenario = [
        "success",
        "mismatch",
        "low",
        "missing",
        "duplicate",
        "failed",
        "success",
        "success",
      ][i % 8];
      const name = sourceNames[i % 8];
      const kind = documentKindFromName(name);
      const code = nextDocumentCode(assignedCodes, kind);
      assignedCodes.push(code);
      return {
        id: code,
        tenantId: i < 11 ? "TENANT_001" : "TENANT_002",
        ownerId: i < 11 ? "USR-003" : "USR-006",
        assignedTo: i < 11 ? "USR-003" : "USR-006",
        name,
        type: labelForKind(kind),
        status:
          scenario === "success"
            ? "COMPLETED"
            : scenario === "failed"
              ? "FAILED"
              : "EXCEPTION",
        createdAt: `2026-09-${String(17 - (i % 6)).padStart(2, "0")}T09:24:00`,
        seconds: 7.2 + (i % 5),
        scenario,
      };
    },
  );
  const extractions = documents.map((d, index) =>
    makeExtraction(
      d.id,
      d.scenario,
      d.tenantId === "TENANT_001" ? "ABC Sdn Bhd" : "XYZ Sdn Bhd",
      d.type,
      d.createdAt,
      index % 2 === 1 ? "ACCOUNTS_RECEIVABLE" : "ACCOUNTS_PAYABLE",
    ),
  );
  extractions[0].fields.invoice.value = "INV-2026-00821";
  extractions[0].fields.invoice.original = "INV-2026-00821";
  return {
    version: 4,
    users,
    tenants: [
      {
        id: "TENANT_001",
        name: "ABC Sdn Bhd",
        registration: "202601234567",
        adminEmail: "alice@abc.example",
        accountLimit: 10,
        status: "ACTIVE",
        createdAt: "2026-08-01",
      },
      {
        id: "TENANT_002",
        name: "XYZ Sdn Bhd",
        registration: "202501003492",
        adminEmail: "david@xyz.example",
        accountLimit: 5,
        status: "ACTIVE",
        createdAt: "2026-08-12",
      },
    ],
    requests: [
      ["Meridian Group Sdn Bhd", "Lim Wei Jun", "wei@meridian.example", "20"],
      ["Nusantara Trading", "Amira Hassan", "amira@nusantara.example", "12"],
      ["Horizon & Co.", "James Teoh", "james@horizon.example", "8"],
    ].map(([company, contact, email, accounts], i) => ({
      id: `REQ-${i + 1}`,
      company,
      contact,
      email,
      accounts: Number(accounts),
      registration: `20260100210${i}`,
      phone: "+60 12 345 6789",
      employees: [],
      notes: "Looking to streamline our monthly invoice processing.",
      submittedAt: "2026-09-17T08:30:00",
      status: "PENDING",
    })),
    limitRequests: [],
    invitations: users
      .filter((u) => u.status === "INVITED")
      .map((u) => ({
        id: `INV-${u.id}`,
        userId: u.id,
        tenantId: u.tenantId!,
        invitedBy: u.invitedBy,
        createdAt: u.invitedAt,
        status: u.status,
      })),
    documents,
    extractions,
    exceptions: documents
      .filter((d) => d.status === "EXCEPTION")
      .map((d, i) => ({
        id: `EXC-${1001 + i}`,
        documentId: d.id,
        tenantId: d.tenantId,
        type:
          d.scenario === "mismatch"
            ? "TOTAL_MISMATCH"
            : d.scenario === "missing"
              ? "MISSING_INVOICE"
              : d.scenario === "duplicate"
                ? "DUPLICATE_INVOICE"
                : "LOW_CONFIDENCE",
        severity: d.scenario === "low" ? "LOW" : "HIGH",
        assignedTo: d.assignedTo,
        createdAt: d.createdAt,
        status: "OPEN",
        message:
          d.scenario === "mismatch"
            ? "Subtotal + tax does not equal total amount."
            : d.scenario === "missing"
              ? "Invoice number is required."
              : d.scenario === "duplicate"
                ? "Invoice number already exists for this supplier."
                : "PO Number confidence is below threshold.",
      })),
    records: documents
      .filter((d) => d.status === "COMPLETED")
      .map((d, i) => ({
        id: `REC-${10021 + i}`,
        documentId: d.id,
        tenantId: d.tenantId,
        createdAt: d.createdAt,
        category:
          Number(d.id.split("-")[1]) % 2 === 0
            ? ("ACCOUNTS_RECEIVABLE" as const)
            : ("ACCOUNTS_PAYABLE" as const),
        validation: "PASSED",
        status: "COMPLETED",
        extraction: structuredClone(
          extractions.find((e) => e.documentId === d.id)!,
        ),
      })),
    audit: documents.map((d, i) => ({
      id: `AUD-${i}`,
      tenantId: d.tenantId,
      user: d.tenantId === "TENANT_001" ? "Rachel Chong" : "Sarah Lim",
      role: "ACCOUNTANT",
      action:
        d.status === "COMPLETED" ? "RECORD_STANDARDISED" : "DOCUMENT_UPLOADED",
      resource: d.name,
      details:
        d.status === "COMPLETED"
          ? "Validated and standardised successfully."
          : "Document received for processing.",
      timestamp: d.createdAt,
    })),
    rules: { TENANT_001: { ...defaultRules }, TENANT_002: { ...defaultRules } },
    settings: {},
  };
}
