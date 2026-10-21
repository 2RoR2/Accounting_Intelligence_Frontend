import { test, expect, type Page, type Route } from "@playwright/test";
const tenant = "11111111-1111-4111-8111-111111111111";
const actor = "33333333-3333-4333-8333-333333333333";
const other = "55555555-5555-4555-8555-555555555555";
const documentId = "44444444-4444-4444-8444-444444444444";
const lineId = "66666666-6666-4666-8666-666666666666";
const reply = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
function state() {
  return { user: { id: actor, name: "Synthetic Reviewer", email: "synthetic@example.test", role: "ACCOUNTANT", tenantId: tenant, tenantCode: "TENANT_901", tenantName: "Synthetic Contract Test", status: "ACTIVE", mustChangePassword: false },
    ownerId: actor, assignedTo: null as string | null, revision: 1, status: "EXTRACTED", amount: "50.00", record: false,
    submittedBy: other, approved: false, patches: [] as Array<{ value: string; expectedContentRevision: number }>, retryCalls: 0,
  };
}
async function mockReview(page: Page, data: ReturnType<typeof state>, line?: (route: Route) => Promise<void>, retry?: (route: Route) => Promise<void>) {
  // Every API request is intercepted. No preserved backend, credentials or DB.
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()); const path = url.pathname; const method = route.request().method();
    if (path === "/api/auth/me") return reply(route, data.user);
    if (path === "/api/tenants") return reply(route, [{ id: tenant, name: "Synthetic Contract Test", status: "ACTIVE" }]);
    if (path === "/api/documents/" + documentId) return reply(route, { id: documentId, code: "SYNTHETIC_001", name: "synthetic-contract.pdf", tenantId: tenant, ownerId: data.ownerId, assignedTo: data.assignedTo, kind: "INVOICE", category: "ACCOUNTS_PAYABLE", status: data.status, contentRevision: data.revision, createdAt: "2026-10-20T00:00:00Z" });
    if (path.endsWith("/extraction")) return reply(route, { documentId, contentRevision: data.revision, classification: { value: "invoice", status: "classified", method: "explicit_heading_rules" }, fields: [{ key: "supplier", value: "Synthetic Supplier", normalizedValue: "Synthetic Supplier", confidence: null }, { key: "total", value: data.amount, normalizedValue: "50.00", confidence: null }, { key: "currency", value: "USD", normalizedValue: "USD", confidence: null }], lineItems: [{ id: lineId, description: "Synthetic item", quantity: "2.000", unit_price: "25.0000", amount: data.amount, evidence: {} }] });
    if (path.endsWith("/validation")) return reply(route, { documentId, contentRevision: data.revision, status: data.status, validationStatus: "PASS", reviewRequired: true, accountingApprovalPerformed: false, coverageComplete: true, passed: 1, warnings: 0, failed: 0, blocking: false, results: [] });
    if (path.endsWith("/reviews")) return reply(route, { submissions: data.status === "IN_REVIEW" || data.approved ? [{ id: "s", submittedBy: data.submittedBy, decision: "SUBMITTED", note: "Synthetic submission", createdAt: "2026-10-20T00:00:00Z" }] : [], decisions: data.approved ? [{ id: "decision", reviewedBy: other, decision: "APPROVED", note: "Synthetic", approvedRevision: data.revision, createdAt: "2026-10-20T00:00:00Z" }] : [] });
    if (path.endsWith("/kind-workflow")) return reply(route, { kind: "invoice", fields: {}, overdue: false, duplicates: [], relatedNotes: [] });
    if (path.endsWith("/file")) return reply(route, { detail: "Synthetic source not provided in this mocked UI test" }, 404);
    if (path === "/api/records") return reply(route, data.record ? [{ id: "synthetic-approved-record", documentId, tenantId: tenant, category: "ACCOUNTS_PAYABLE", validation: "PASSED", status: "COMPLETED", createdAt: "2026-10-20T00:00:00Z", snapshot: { contentRevision: data.revision, fieldPredictions: [], lineItems: [] } }] : []);
    if (method === "PATCH" && path.includes("/line-items/")) {
      data.patches.push(route.request().postDataJSON());
      if (line) return line(route);
      return reply(route, { detail: "Line correction rejected by mocked server" }, 403);
    }
    if (path.endsWith("/retry") && method === "POST") { data.retryCalls++; return retry ? retry(route) : reply(route, { detail: { code: "RETRY_PROTOCOL_REQUIRED", message: "Retry unavailable until guarded worker claims are approved.", dispatchAttempted: false } }, 409); }
    if (method === "GET") return reply(route, []);
    return reply(route, { detail: "Synthetic server refused this mutation" }, 403);
  });
}

test("confirmed retry refreshes authoritative state and prevents repeated clicks",async({page})=>{
 const data=state();data.status='FAILED';let requests=0;
 await mockReview(page,data,undefined,async route=>{requests++;await new Promise(resolve=>setTimeout(resolve,250));data.status='QUEUED';return reply(route,{id:documentId,jobId:'db-job',queueJobId:null,status:'QUEUED',jobStatus:'DISPATCHED',dispatchAccepted:true});});
 await page.goto('/workspace/documents/'+documentId);
 const retry=page.getByRole('button',{name:'Retry extraction',exact:true});await expect(retry).toBeEnabled();
 await retry.evaluate(element=>{(element as HTMLButtonElement).click();(element as HTMLButtonElement).click();});
 await expect(page.getByText('Retry dispatch confirmed.',{exact:false})).toBeVisible();
 await expect(page.getByText(/Processing job: db-job/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Waiting for Docling extraction',exact:true})).toBeDisabled();expect(requests).toBe(1);
 await page.reload();await expect(page.getByRole('button',{name:'Waiting for Docling extraction',exact:true})).toBeDisabled();
});
for(const [status,code] of [[409,'JOB_ALREADY_OPEN'],[409,'AMENDMENT_REQUIRED'],[403,'FORBIDDEN'],[422,'INVALID_STATE'],[503,'DISPATCH_UNCONFIRMED'],[200,'INCOMPLETE']] as const){test('retry '+status+' '+code+' never claims success and refreshes',async({page})=>{
 const data=state();data.status='FAILED';let reads=0;
 page.on('response',response=>{if(new URL(response.url()).pathname==='/api/documents/'+documentId&&response.request().method()==='GET')reads++;});
 await mockReview(page,data,undefined,route=>reply(route,status===200?{id:documentId,jobId:'db-job',dispatchAccepted:false}:{detail:{code,message:'Server retry refused',dispatchAccepted:false}},status));
 await page.goto('/workspace/documents/'+documentId);await page.getByRole('button',{name:'Retry extraction',exact:true}).click();
 await expect(page.locator('[role="alert"]').filter({hasText:status===200?'Retry dispatch was not confirmed':'Server retry refused'})).toBeVisible();
 await expect(page.getByText(/Retry dispatch confirmed\./)).toHaveCount(0);await expect.poll(()=>reads).toBeGreaterThanOrEqual(2);expect(data.retryCalls).toBe(1);
});}
