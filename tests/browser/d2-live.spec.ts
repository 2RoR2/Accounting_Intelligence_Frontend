import {test,expect,type Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHmac,randomUUID} from "node:crypto";
const backend=resolve(process.cwd(),"../Accounting_Intelligence_Backend_V2");
type SyntheticAccount={email:string;password:string;totp_secret:string;user_id:string};
function totp(secret:string) {
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";
  for(const char of secret.replace(/=+$/,"").toUpperCase()) bits+=alphabet.indexOf(char).toString(2).padStart(5,"0");
  const key=Buffer.from((bits.match(/.{8}/g)??[]).map(v=>parseInt(v,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac("sha1",key).update(counter).digest();const offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");
}
async function signIn(page:Page,account:SyntheticAccount) {
  // Catch action errors here so credentials/OTP never appear in test call logs.
  try {
    await page.goto("/login");
    await page.getByLabel("Company email *",{exact:true}).fill(account.email);
    await page.getByLabel("Password *",{exact:true}).fill(account.password);
    await page.getByRole("button",{name:"Continue with email"}).click();
    await expect(page.getByLabel("Authenticator digit 1",{exact:true})).toBeVisible();
    const code=totp(account.totp_secret);
    for(let i=0;i<6;i++) await page.getByLabel("Authenticator digit "+(i+1),{exact:true}).fill(code[i]);
    const response=page.waitForResponse(r=>r.url().includes("/api/auth/verify-mfa")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Verify and continue"}).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("link",{name:"Continue to workspace"})).toBeVisible();
    await page.getByRole("link",{name:"Continue to workspace"}).click();
    const me=await page.request.get("/api/auth/me");expect(me.status()).toBe(200);
    expect((await me.json()).id).toBe(account.user_id);
  } catch {throw new Error("Real synthetic password/TOTP browser login failed; credentials omitted.");}
}
async function upload(page:Page,name:string,fixture:string) {
  await page.goto("/company/upload");
  const payload=Buffer.concat([readFileSync(fixture.startsWith("multidocument/") ? join(backend,"tests/extraction/data",fixture) : join(backend,"runs/d1a/demo-ready",fixture)),Buffer.from("\n% D2 browser run "+randomUUID()+"\n")]);
  await expect(page.getByLabel("Document type",{exact:true})).toHaveValue("AUTO");
  await expect(page.locator('option[value="BILL"]')).toBeEnabled();
  await expect(page.locator('option[value="RECEIPT"]')).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({name,mimeType:"application/pdf",buffer:payload});
  const response=page.waitForResponse(r=>r.url().includes("/api/documents?")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"Upload and process"}).click();
  const uploaded=await response;expect(uploaded.status()).toBe(201);
  const dto=await uploaded.json();expect(dto.queueJobId).toBeTruthy();
  await expect(page.getByRole("link",{name:"Review extracted document"})).toBeVisible({timeout:180000});
  await page.getByRole("link",{name:"Review extracted document"}).click();
  await expect(page).toHaveURL(new RegExp("/company/documents/"+dto.id+"$"));
  await expect(page.getByText("Backend validation",{exact:true})).toBeVisible();
  return dto.id as string;
}
test("real multi-document website, password/TOTP, Docling, validation and revision correction",async({browser},info)=>{
  expect(readFileSync(".env.local","utf8").split(/\r?\n/).find(line=>line.startsWith("BACKEND_URL="))).toBe("BACKEND_URL=http://127.0.0.1:8002");
  const accounts=JSON.parse(readFileSync(join(backend,"runs/d1a/accounts.json"),"utf8")) as SyntheticAccount[];
  expect(accounts.every(a=>a.email.endsWith("@example.test"))).toBeTruthy();
  const first=await browser.newContext();const second=await browser.newContext();
  const valid=await first.newPage();const bad=await second.newPage();
  const pageErrors:string[]=[];for(const p of [valid,bad]) p.on("pageerror",e=>pageErrors.push(e.message));
  await signIn(valid,accounts[0]);
  const validId=await upload(valid,"D2-valid-"+Date.now()+".pdf","complete.pdf");
  await expect(valid.getByText("PASS",{exact:true}).first()).toBeVisible();
  await expect(valid.getByRole("textbox",{name:"Total",exact:true})).toHaveValue("50.00");
  await expect(valid.getByText(/Source classification: invoice/)).toBeVisible();
  await valid.getByRole("textbox",{name:"Total",exact:true}).focus();
  await expect(valid.locator('[aria-label="Source evidence"]')).toContainText("#/texts/");
  await expect(valid.getByTitle("Original document")).toHaveAttribute("src",new RegExp("/api/documents/"+validId+"/file"));
  const source = await valid.request.get("/api/documents/"+validId+"/file"); expect(source.status()).toBe(200); expect(source.headers()["content-type"]).toContain("application/pdf");
  await valid.screenshot({path:info.outputPath("valid-1440.png"),fullPage:true});
  await valid.setViewportSize({width:1366,height:768});
  await valid.screenshot({path:info.outputPath("valid-1366.png"),fullPage:true});
  await valid.setViewportSize({width:390,height:844});
  await expect.poll(()=>valid.locator(".app-main").evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(370);
  await expect(valid.getByRole("textbox",{name:"Total",exact:true})).toBeVisible();
  await valid.screenshot({path:info.outputPath("valid-mobile.png"),fullPage:true});
  await signIn(bad,accounts[1]);
  const badId=await upload(bad,"D2-incorrect-"+Date.now()+".pdf","incorrect.pdf");
  await expect(bad.getByRole("textbox",{name:"Total",exact:true})).toHaveValue("99.00");
  await expect(bad.getByText(/subtotal \+ tax_amount - discount = 50.00 does not match total_amount = 99.00/).first()).toBeVisible();
  await expect(bad.getByText(/EX-005/).first()).toBeVisible();
  await bad.screenshot({path:info.outputPath("incorrect.png"),fullPage:true});
  await bad.goto("/company/exceptions");
  await expect(bad.getByRole("cell").filter({hasText:"VALIDATION:EX-005"}).first()).toBeVisible();
  await bad.goto("/company/documents/"+badId);
  await expect(bad.getByRole("textbox",{name:"Total",exact:true})).toHaveValue("99.00");
  const before=await (await bad.request.get("/api/documents/"+badId+"/extraction")).json();
  const stale=await second.newPage();await stale.goto("/company/documents/"+badId);
  await expect(stale.getByRole("textbox",{name:"Total",exact:true})).toHaveValue("99.00");
  await bad.getByRole("textbox",{name:"Total",exact:true}).fill("50.00");
  const saved=bad.waitForResponse(r=>r.url().endsWith("/extraction/total")&&r.request().method()==="PATCH");
  await bad.getByRole("button",{name:"Save Total",exact:true}).click();
  const savedResponse=await saved;expect(savedResponse.status()).toBe(200);
  expect(savedResponse.request().postDataJSON().expectedContentRevision).toBe(before.contentRevision);
  const correction=await savedResponse.json();expect(correction.contentRevision).toBe(before.contentRevision+1);
  await stale.getByRole("textbox",{name:"Total",exact:true}).fill("49.00");
  const conflict=stale.waitForResponse(r=>r.url().endsWith("/extraction/total")&&r.request().method()==="PATCH");
  await stale.getByRole("button",{name:"Save Total",exact:true}).click();expect((await conflict).status()).toBe(409);
  await expect(stale.getByText(/your draft is retained/)).toBeVisible();
  await expect(stale.getByRole("textbox",{name:"Total",exact:true})).toHaveValue("49.00");
  await expect(stale.getByRole("button",{name:"Save Total",exact:true})).toBeDisabled();
  await stale.screenshot({path:info.outputPath("stale-revision.png"),fullPage:true});
  await bad.getByRole("button",{name:"Save & revalidate",exact:true}).click();
  await expect(bad.getByText("PASS",{exact:true}).first()).toBeVisible();
  await bad.reload();await expect(bad.getByRole("textbox",{name:"Total",exact:true})).toHaveValue("50.00");
  await expect(bad.getByText("Content revision "+correction.contentRevision,{exact:true})).toBeVisible();
  const after=await (await bad.request.get("/api/documents/"+badId+"/extraction")).json();
  const total=after.fields.find((f:{key:string})=>f.key==="total");
  expect(total.normalizedValue).toBe("99.00");expect(total.currentValue).toBe("50.00");
  const report=await (await bad.request.get("/api/documents/"+badId+"/validation")).json();
  expect(report.validationStatus).toBe("PASS");expect(report.reviewRequired).toBe(true);
  expect(report.accountingApprovalPerformed).toBe(false);
  await bad.screenshot({path:info.outputPath("corrected-reloaded.png"),fullPage:true});
  await valid.setViewportSize({width:1440,height:900});
  const multi:Array<Record<string,unknown>>=[];
  for(const item of [
    {file:"invoice_b.pdf",kind:"invoice",heading:"Invoice details",field:"Total",total:"48.00",validation:"PASS"},
    {file:"utility_bill.pdf",kind:"bill",heading:"Bill details",field:"Amount due",total:"80.00",validation:"REVIEW_REQUIRED"},
    {file:"retail_receipt.pdf",kind:"receipt",heading:"Receipt details",field:"Total",total:"10.60",validation:"REVIEW_REQUIRED"},
    {file:"unknown.pdf",kind:"unknown",heading:"Unknown / Needs Review",field:"",total:null,validation:"REVIEW_REQUIRED"},
  ]) {
    const id=await upload(valid,"D22-"+Date.now()+"-"+item.file,"multidocument/"+item.file);
    await expect(valid.getByRole("heading",{name:item.heading,exact:true})).toBeVisible();
    const extraction=await (await valid.request.get("/api/documents/"+id+"/extraction")).json();
    const validation=await (await valid.request.get("/api/documents/"+id+"/validation")).json();
    expect(extraction.classification.value).toBe(item.kind);expect(validation.validationStatus).toBe(item.validation);
    expect(validation.reviewRequired).toBe(true);expect(validation.accountingApprovalPerformed).toBe(false);
    await expect(valid.getByText(item.validation.replaceAll("_"," "),{exact:true}).first()).toBeVisible();
    if(item.total!==null) {
      await expect(valid.getByRole("textbox",{name:item.field,exact:true})).toHaveValue(item.total);
      await valid.getByRole("textbox",{name:item.field,exact:true}).focus();
      await expect(valid.locator('[aria-label="Source evidence"]')).toContainText("Text span");
      await expect(valid.locator('[aria-label="Source evidence"]')).toContainText("source block");
    }
    if(item.kind==="bill") {
      for(const [label,value] of [["Issuer","Synthetic Utilities"],["Bill reference","SYN-BILL-001"],["Account number","SYN-ACC-001"],["Billing period","2026-09-01 to 2026-09-30"],["Due date","2026-10-31"]])
        await expect(valid.getByRole("textbox",{name:label,exact:true})).toHaveValue(value);
      await expect(valid.getByRole("textbox",{name:"Invoice number",exact:true})).toHaveCount(0);
      expect(extraction.lineItems[0].quantity).toBeNull();expect(extraction.lineItems[0].unit_price).toBeNull();
      await expect(valid.getByRole("cell",{name:"Not provided",exact:true}).first()).toBeVisible();
      await valid.setViewportSize({width:1366,height:768});
    }
    if(item.kind==="receipt") {
      for(const [label,value] of [["Merchant","Synthetic Retail"],["Receipt reference","SYN-R-001"],["Transaction date","2026-10-19"],["Transaction time","14:35:20"],["Payment method","Card"]])
        await expect(valid.getByRole("textbox",{name:label,exact:true})).toHaveValue(value);
    }
    await valid.getByText("Classification evidence",{exact:true}).click();
    if(item.kind!=="unknown") await expect(valid.locator('section[aria-label="'+item.heading+'"]')).toContainText("#/texts/");
    if(item.kind==="unknown") {
      expect(extraction.fields).toEqual([]);expect(extraction.lineItems).toEqual([]);expect(validation.status).toBe("EXCEPTION");
      await expect(valid.getByText("No accounting fields available. Review the original source.",{exact:true})).toBeVisible();
      await expect(valid.getByRole("textbox",{name:"Total",exact:true})).toHaveCount(0);
      await expect(valid.getByText(/NO_SUPPORTED_DOCUMENT_HEADING/)).toBeVisible();
    }
    await valid.screenshot({path:info.outputPath(item.kind+"-review.png"),fullPage:true});
    const original=await valid.request.get("/api/documents/"+id+"/file");expect(original.status()).toBe(200);expect(original.headers()["content-type"]).toContain("application/pdf");
    await valid.getByRole("button",{name:"Validation",exact:true}).click();
    if(item.kind==="bill"||item.kind==="receipt") {
      expect(validation.coverageComplete).toBe(false);expect(validation.passed).toBe(0);
      await expect(valid.getByRole("cell",{name:"NOT CHECKED",exact:true})).toHaveCount(2);
      await expect(valid.getByText("PASS",{exact:true})).toHaveCount(0);
      await expect(valid.getByRole("button",{name:"Create standardised record",exact:true})).toBeDisabled();
      await valid.screenshot({path:info.outputPath(item.kind+"-not-checked.png"),fullPage:true});
    }
    if(item.kind==="unknown") await expect(valid.getByRole("button",{name:"Create standardised record",exact:true})).toBeDisabled();
    if(item.kind==="receipt") {
      await valid.getByRole("button",{name:"Review",exact:true}).click();
      await valid.setViewportSize({width:390,height:844});
      await expect(valid.getByRole("textbox",{name:"Merchant",exact:true})).toBeVisible();
      await valid.screenshot({path:info.outputPath("receipt-mobile.png"),fullPage:true});
    }
    multi.push({id,file:item.file,kind:extraction.classification.value,validation:validation.validationStatus,status:validation.status,total:item.total,revision:extraction.contentRevision});
    await valid.setViewportSize({width:1440,height:900});
  }
  console.log(JSON.stringify({multiDocument:multi}));
  expect(pageErrors).toEqual([]);
  console.log(JSON.stringify({valid:{id:validId,status:"EXTRACTED",validation:"PASS",total:"50.00"},incorrect:{id:badId,initialTotal:"99.00",rule:"EX-005"},correction:{revision:correction.contentRevision,currentValue:total.currentValue,originalValue:total.normalizedValue},staleStatus:409}));
  await first.close();await second.close();
});
