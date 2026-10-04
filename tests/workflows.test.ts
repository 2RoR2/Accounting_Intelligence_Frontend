import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readDb, resetRepository } from "../src/lib/mock/repository";
import {
  approveCompanyRequest,
  requestEnterpriseAccess,
  updateAccountLimit,
  usage,
  setTenantStatus,
} from "../src/lib/api/tenant.service";
import {
  inviteAccountant,
  changeUserStatus,
} from "../src/lib/api/user.service";
import { activateAccount } from "../src/lib/api/auth.service";
import {
  advanceProcessing,
  getDocuments,
  getExtraction,
  getValidationResults,
  revalidateDocument,
  updateExtractedField,
  uploadDocument,
} from "../src/lib/api/document.service";
import {
  getRecordMetadata,
  getStandardisedRecords,
  openSupportView,
  standardiseDocument,
} from "../src/lib/api/record.service";
import { getAuditLogs } from "../src/lib/api/audit.service";
const user = (id: string) => readDb().users.find((u) => u.id === id)!;
beforeEach(() => resetRepository());
test("enterprise request → approval → activation → invitation reserves seats", async () => {
  const request = await requestEnterpriseAccess({
    company: "New Company",
    registration: "202609170001",
    contact: "Alex Tan",
    email: "alex@new.example",
    phone: "",
    accounts: 10,
    employees: [],
    notes: "Monthly accounting",
  });
  const tenantId = await approveCompanyRequest(user("USR-001"), request.id, 10);
  assert.equal(usage(tenantId), 1);
  const admin = readDb().users.find((u) => u.tenantId === tenantId)!;
  assert.equal(admin.status, "INVITED");
  await activateAccount(admin.id, "StrongPass123!", "StrongPass123!");
  const employee = await inviteAccountant(
    user(admin.id),
    "New Accountant",
    "employee@new.example",
  );
  assert.equal(usage(tenantId), 2);
  assert.equal(employee.status, "INVITED");
  await activateAccount(employee.id, "StrongPass123!", "StrongPass123!");
  assert.equal(user(employee.id).status, "ACTIVE");
  assert.equal(usage(tenantId), 2);
  assert.equal("password" in user(employee.id), false);
});
test("pending invitations count toward limits; cancelling frees a seat", async () => {
  await updateAccountLimit(
    user("USR-001"),
    "TENANT_001",
    7,
    "Approved capacity",
  );
  await assert.rejects(
    inviteAccountant(user("USR-002"), "Too Many", "full@abc.example"),
    /LIMIT REACHED/,
  );
  await assert.rejects(
    updateAccountLimit(user("USR-001"), "TENANT_001", 6, "Reduce"),
    /below/,
  );
  await changeUserStatus(user("USR-002"), "USR-004", "INVITATION_EXPIRED");
  assert.equal(usage("TENANT_001"), 6);
  await inviteAccountant(user("USR-002"), "Allowed", "allowed@abc.example");
  assert.equal(usage("TENANT_001"), 7);
});
test("total correction and human review are required before standardisation", async () => {
  const accountant = user("USR-003");
  const doc = await uploadDocument(
    accountant,
    { name: "test.pdf", size: 400, type: "application/pdf" },
    "mismatch",
  );
  await advanceProcessing(accountant, doc.id, "EXTRACTED");
  assert.ok(
    (await getValidationResults(accountant, doc.id)).some(
      (v) => v.rule === "Total Calculation" && v.result === "FAIL",
    ),
  );
  await assert.rejects(standardiseDocument(accountant, doc.id), /Resolve/);
  await updateExtractedField(accountant, doc.id, "total", "848.00");
  await revalidateDocument(accountant, doc.id, "Corrected total");
  assert.equal(
    readDb().documents.find((d) => d.id === doc.id)!.status,
    "IN_REVIEW",
  );
  await updateExtractedField(accountant, doc.id, "reference", "PO-2192");
  await revalidateDocument(accountant, doc.id, "Checked purchase order");
  const recordId = await standardiseDocument(accountant, doc.id);
  assert.equal(
    (await getStandardisedRecords(accountant)).find((r) => r.id === recordId)!
      .extraction.fields.total.value,
    "848.00",
  );
  assert.ok(
    readDb()
      .exceptions.filter((e) => e.documentId === doc.id)
      .every((e) => e.status === "RESOLVED"),
  );
  await assert.rejects(
    updateExtractedField(accountant, doc.id, "total", "100"),
    /immutable/,
  );
});
test("tenant isolation, assigned document access, and SAIC support gate", async () => {
  const abc = user("USR-003");
  const xyz = user("USR-006");
  const saic = user("USR-001");
  assert.ok(
    (await getDocuments(xyz)).every((d) => d.tenantId === "TENANT_002"),
  );
  await assert.rejects(getExtraction(xyz, "INVOICE_100001"), /not found/);
  await assert.rejects(getExtraction(saic, "INVOICE_100001"), /role/);
  await assert.rejects(getStandardisedRecords(saic), /role/);
  assert.equal("extraction" in (await getRecordMetadata(saic))[0], false);
  await assert.rejects(openSupportView(saic, "REC-10021", ""), /reason/);
  const record = await openSupportView(
    saic,
    "REC-10021",
    "Investigate support ticket 123",
  );
  assert.equal(record.extraction.fields.total.value, "848.00");
  assert.ok(
    (await getAuditLogs(saic)).some(
      (a) => a.action === "SUPPORT_VIEW_ACCESSED",
    ),
  );
  assert.ok(
    (await getStandardisedRecords(abc)).every(
      (r) => r.tenantId === "TENANT_001",
    ),
  );
  assert.equal((await getDocuments(user("USR-007"))).length, 0);
});
test("uploads reject unsupported, empty, and oversized files", async () => {
  const accountant = user("USR-003");
  await assert.rejects(
    uploadDocument(
      accountant,
      { name: "bad.exe", size: 50, type: "" },
      "success",
    ),
    /Supported/,
  );
  await assert.rejects(
    uploadDocument(
      accountant,
      { name: "empty.pdf", size: 0, type: "" },
      "success",
    ),
    /empty/,
  );
  await assert.rejects(
    uploadDocument(
      accountant,
      { name: "big.pdf", size: 21 * 1024 * 1024, type: "" },
      "success",
    ),
    /20 MB/,
  );
});
test("uploads accept CSV and TIFF documents", async () => {
  const accountant = user("USR-003");
  const csv = await uploadDocument(
    accountant,
    { name: "customer-invoices.csv", size: 512, type: "text/csv" },
    "success",
    "ACCOUNTS_RECEIVABLE",
  );
  const tiff = await uploadDocument(
    accountant,
    { name: "supplier-invoice.tiff", size: 2048, type: "image/tiff" },
    "success",
    "ACCOUNTS_PAYABLE",
  );
  assert.equal(csv.name, "customer-invoices.csv");
  assert.equal(tiff.name, "supplier-invoice.tiff");
});
test("suspension blocks company service access", async () => {
  await setTenantStatus(user("USR-001"), "TENANT_001");
  await assert.rejects(getDocuments(user("USR-003")), /suspended/);
});
