import {test as base,expect,type Page,type TestInfo,type BrowserContext} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHmac,createHash} from 'node:crypto';
const backend=resolve(process.cwd(),'../Accounting_Intelligence_Backend_V2');
function localPath(path:string){return path.startsWith('/mnt/c/')?'C:/'+path.slice(7):path;}
const manifest=JSON.parse(readFileSync(join(backend,'runs/d4a/manifest.json'),'utf8'));
const privatePath=localPath(manifest.private_account_path);
if(!resolve(privatePath).startsWith(backend)) throw new Error('Private account path outside Backend_V2');
type Account={email:string;password:string;totp_secret:string;user_id:string};
const accounts=JSON.parse(readFileSync(privatePath,'utf8')) as Account[];
const test=base.extend<object,{sessions:BrowserContext[]}>({
  sessions:[async({browser},provide)=>{
    const sessions=await Promise.all(accounts.map(()=>browser.newContext({baseURL:'http://127.0.0.1:3000',viewport:{width:1440,height:900}})));
    try{await provide(sessions);}finally{await Promise.all(sessions.map(context=>context.close()));}
  },{scope:'worker'}],
  context:async({sessions},provide,info)=>{
    const account=info.title.includes('invalid.pdf')||info.title.includes('saved correction')?1:info.title.includes('EX-008')?2:0;
    await provide(sessions[account]);
  },
});
const authenticated=new WeakMap<BrowserContext,string>();
const output=process.env.D4A_OUTPUT_DIR!;
if(!output) throw new Error('Use playwright.d4a.config.ts');
let consoleErrors:string[]=[];
let pageErrors:string[]=[];
function record(name:string,value:unknown){
  mkdirSync(output,{recursive:true});const file=join(output,'evidence.json');
  const old=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
  old[name]=value;writeFileSync(file,JSON.stringify(old,null,2));
}
function totp(secret:string){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.replace(/=+$/,'').toUpperCase())bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from((bits.match(/.{8}/g)??[]).map(v=>parseInt(v,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest();const offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
async function signIn(page:Page,index=0){
  const account=accounts[index];
  if(!account.email.endsWith('@example.test'))throw new Error('Synthetic accounts only');
  try{
    if(authenticated.get(page.context())===account.user_id){
      const me=await page.request.get('/api/auth/me');expect(me.status()).toBe(200);
      expect((await me.json()).id).toBe(account.user_id);
    }else{
    await page.goto('/login');
    await page.getByLabel('Company email *',{exact:true}).fill(account.email);
    await page.getByLabel('Password *',{exact:true}).fill(account.password);
    await page.getByRole('button',{name:'Continue with email',exact:true}).click();
    await expect(page.getByLabel('Authenticator digit 1',{exact:true})).toBeVisible();
    const code=totp(account.totp_secret);
    for(let i=0;i<6;i++)await page.getByLabel('Authenticator digit '+(i+1),{exact:true}).fill(code[i]);
    const mfa=page.waitForResponse(r=>r.url().endsWith('/api/auth/verify-mfa')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Verify and continue',exact:true}).click();
    expect((await mfa).status()).toBe(200);
    await page.getByRole('link',{name:'Continue to workspace',exact:true}).click();
    const me=await page.request.get('/api/auth/me');expect(me.status()).toBe(200);
    expect((await me.json()).id).toBe(account.user_id);
    authenticated.set(page.context(),account.user_id);
    record('browser-auth-'+index,{passwordLogin:200,totp:200,me:200,sessionReusedWithoutCookieInjection:true});
    }
  }catch{throw new Error('Synthetic password/TOTP browser login failed; credentials omitted.');}
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('console',message=>{
    if(message.type()==='error'||message.type()==='warning')consoleErrors.push(message.text());
  });
}
async function shot(page:Page,info:TestInfo,name:string){await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});}
async function upload(page:Page,file:string,info:TestInfo){
  const bytes=readFileSync(join(localPath(manifest.pdf_dir),file));
  await page.goto('/company/upload');
  await expect(page.getByLabel('Document type',{exact:true})).toHaveValue('AUTO');
  await page.locator('input[type="file"]').setInputFiles({name:'D4A-'+file,mimeType:'application/pdf',buffer:bytes});
  const posted=page.waitForResponse(r=>r.url().includes('/api/documents?')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Upload and process',exact:true}).click();
  const response=await posted;expect(response.status()).toBe(201);
  const dto=await response.json();expect(dto.queueJobId).toBeTruthy();
  await expect(page.getByRole('link',{name:'Review extracted document',exact:true})).toBeVisible({timeout:180000});
  await page.getByRole('link',{name:'Review extracted document',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/company/documents/'+dto.id+'$'));
  await expect(page.getByText('Backend validation',{exact:true})).toBeVisible();
  const extractionResponse=await page.request.get('/api/documents/'+dto.id+'/extraction');
  const validationResponse=await page.request.get('/api/documents/'+dto.id+'/validation');
  expect(extractionResponse.status()).toBe(200);expect(validationResponse.status()).toBe(200);
  const extraction=await extractionResponse.json();const report=await validationResponse.json();
  expect(report.reviewRequired).toBe(true);expect(report.accountingApprovalPerformed).toBe(false);
  expect(extraction.fields.every((field:{confidence:unknown})=>field.confidence===null)).toBe(true);
  await expect(page.getByTitle('Original document')).toHaveAttribute('src',new RegExp('/api/documents/'+dto.id+'/file'));
  const source=await page.request.get('/api/documents/'+dto.id+'/file');expect(source.status()).toBe(200);
  expect(source.headers()['content-type']).toContain('application/pdf');
  expect(createHash('sha256').update(await source.body()).digest('hex')).toBe(createHash('sha256').update(bytes).digest('hex'));
  record(file,{id:dto.id,uploadStatus:response.status(),initialProcessingStatus:dto.status,
    extraction,report,sourceVerified:true,syntheticRun:manifest.run});
  await shot(page,info,'review');
  return {id:dto.id,extraction,report};
}
async function validationTab(page:Page){
  await page.getByRole('button',{name:'Validation',exact:true}).click();
  await expect(page.getByRole('columnheader',{name:'Severity',exact:true})).toBeVisible();
}
async function noApproval(page:Page){await expect(page.getByRole('button',{name:'Create standardised record',exact:true})).toBeDisabled();}
test.beforeEach(()=>{consoleErrors=[];pageErrors=[];});
test.afterEach(async({page},info)=>{
  // Keep observed Next development warnings in evidence, separately from errors.
  // React key warnings and every other unexpected message still fail acceptance.
  const knownDevelopmentWarnings=consoleErrors.filter(text=>text.startsWith('Skipping auto-scroll behavior')||
    text.startsWith('Detected `scroll-behavior: smooth`')||
    text.startsWith('Image with src "')&&text.includes('saic_logo')&&text.includes('width or height modified'));
  const unexpected=consoleErrors.filter(text=>!text.includes('409 (Conflict)')&&!knownDevelopmentWarnings.includes(text));
  record(info.title+' diagnostics',{status:info.status,pageErrors,consoleErrors,knownDevelopmentWarnings,unexpectedConsole:unexpected});
  if(!page.url().includes('/login')&&!page.url().includes('/mfa'))await shot(page,info,'final');
  expect(pageErrors,'Browser page errors').toEqual([]);
  expect(unexpected,'Unexpected browser console errors/warnings').toEqual([]);
});

for(const item of [
  {file:'valid.pdf',kind:'invoice',total:'50.00',state:'PASS',account:0,heading:'Invoice details',field:'Total'},
  {file:'invalid.pdf',kind:'invoice',total:'99.00',state:'REVIEW_REQUIRED',account:1,heading:'Invoice details',field:'Total'},
  {file:'invoice_b.pdf',kind:'invoice',total:'48.00',state:'PASS',account:0,heading:'Invoice details',field:'Total'},
  {file:'utility_bill.pdf',kind:'bill',total:'80.00',state:'REVIEW_REQUIRED',account:0,heading:'Bill details',field:'Amount due'},
  {file:'retail_receipt.pdf',kind:'receipt',total:'10.60',state:'PASS',account:0,heading:'Receipt details',field:'Total'},
  {file:'unknown.pdf',kind:'unknown',total:null,state:'REVIEW_REQUIRED',account:0,heading:'Unknown / Needs Review',field:''},
])test('six workflows: '+item.file,async({page},info)=>{
  await signIn(page,item.account);const result=await upload(page,item.file,info);
  expect(result.extraction.classification.value).toBe(item.kind);expect(result.report.validationStatus).toBe(item.state);
  await expect(page.getByRole('heading',{name:item.heading,exact:true})).toBeVisible();
  if(item.total!==null){
    await expect(page.getByRole('textbox',{name:item.field,exact:true})).toHaveValue(item.total);
    await page.getByRole('textbox',{name:item.field,exact:true}).focus();
    await expect(page.locator('[aria-label="Source evidence"]')).toContainText('#/texts/');
  }else{
    expect(result.extraction.fields).toEqual([]);expect(result.extraction.lineItems).toEqual([]);
    await expect(page.getByText('No accounting fields available. Review the original source.',{exact:true})).toBeVisible();
  }
  if(item.kind==='bill'){
    for(const [label,value]of [['Issuer','Synthetic Utilities'],['Bill reference','SYN-BILL-001'],['Account number','SYN-ACC-001'],['Billing period','2026-09-01 to 2026-09-30'],['Due date','2026-10-31']])
      await expect(page.getByRole('textbox',{name:label,exact:true})).toHaveValue(value);
    expect(result.extraction.lineItems[0].quantity).toBeNull();expect(result.extraction.lineItems[0].unit_price).toBeNull();
  }
  if(item.kind==='receipt')for(const [label,value]of [['Merchant','Synthetic Retail'],['Transaction date','2026-10-19'],['Transaction time','14:35:20'],['Payment method','Card']])
    await expect(page.getByRole('textbox',{name:label,exact:true})).toHaveValue(value);
  await validationTab(page);await noApproval(page);
  if(item.file==='invalid.pdf'){
    const finding=page.getByRole('row').filter({hasText:'EX-005'}).first();
    await expect(finding).toContainText('high');await expect(finding).toContainText('total_amount');await expect(finding).toContainText('99.00');
    await page.goto('/company/exceptions');await expect(page.getByRole('cell').filter({hasText:'VALIDATION:EX-005'}).first()).toBeVisible();
    await shot(page,info,'exceptions');await page.goto('/company/documents/'+result.id);await validationTab(page);
  }
  if(item.kind==='bill'){
    expect(result.report.coverageComplete).toBe(false);
    await expect(page.getByRole('row').filter({hasText:'BILL-AMOUNT_DUE'})).toContainText('NOT CHECKED');
    await expect(page.getByRole('row').filter({hasText:'BILL-BILLING_PERIOD'})).toContainText('PASS');
  }
  if(item.kind==='receipt'){
    expect(result.report.coverageComplete).toBe(true);
    await expect(page.getByRole('cell',{name:'NOT CHECKED',exact:true})).toHaveCount(0);
    await expect(page.getByRole('row').filter({hasText:'RECEIPT-TOTAL'})).toContainText('PASS');
  }
  await shot(page,info,'validation-1440');
  await page.setViewportSize({width:1366,height:768});await shot(page,info,'validation-1366');
  await page.getByRole('button',{name:'Review',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.locator('.app-main').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(370);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await shot(page,info,'review-mobile');
});

for(let number=1;number<=6;number++)test('M3A EX-00'+number+' browser rendering',async({page},info)=>{
  await signIn(page);const {report}=await upload(page,'ex00'+number+'.pdf',info);
  const code='EX-00'+number;const finding=report.results.find((r:{rule:string;code?:string})=>r.rule===code&&r.code);
  expect(finding).toBeTruthy();await validationTab(page);
  const row=page.getByRole('row').filter({hasText:code}).first();
  await expect(row).toContainText(finding.field);await expect(row).toContainText(finding.severity);await expect(row).toContainText(finding.message);
  await noApproval(page);await shot(page,info,'exception');
});

test('M3A EX-007 duplicate reference details',async({page},info)=>{
  await signIn(page);const first=await upload(page,'duplicate-first.pdf',info);expect(first.report.validationStatus).toBe('PASS');
  const second=await upload(page,'duplicate-second.pdf',info);const finding=second.report.results.find((r:{rule:string})=>r.rule==='EX-007');
  expect(finding.duplicate_of).toBe(first.id);await validationTab(page);await shot(page,info,'duplicate-before-assertion');
  const row=page.getByRole('row').filter({hasText:'EX-007'}).first();
  await expect(row).toContainText('high');await expect(row).toContainText(first.id);await noApproval(page);
});

test('M3A EX-008 vendor suggestion details',async({page},info)=>{
  await signIn(page,2);const {report}=await upload(page,'ex008.pdf',info);
  const finding=report.results.find((r:{rule:string})=>r.rule==='EX-008');expect(finding.vendor_candidate).toBeTruthy();
  await validationTab(page);await shot(page,info,'vendor-before-assertion');
  const row=page.getByRole('row').filter({hasText:'EX-008'}).first();
  await expect(row).toContainText('medium');await expect(row).toContainText(finding.vendor_candidate.vendor_name);
  await expect(row).toContainText(String(finding.vendor_candidate.similarity));
  await expect(row).toContainText(/Similarity/);await noApproval(page);
});

test('multiple EX-001 findings retain distinct rows',async({page},info)=>{
  await signIn(page);const {report}=await upload(page,'multiple-missing.pdf',info);await validationTab(page);
  const errors=report.results.filter((r:{code?:string})=>r.code==='EX-001');expect(errors.length).toBeGreaterThan(1);
  await expect(page.getByRole('row').filter({hasText:'EX-001'})).toHaveCount(errors.length);
  await shot(page,info,'multiple-findings');
});

test('M3B receipt mismatch is FAIL without a false NOT_CHECKED badge',async({page},info)=>{
  await signIn(page);const {report}=await upload(page,'receipt-bad.pdf',info);expect(report.blocking).toBe(true);
  expect(report.results.every((r:{checkStatus:string})=>r.checkStatus==='CHECKED')).toBe(true);
  await shot(page,info,'receipt-mismatch-before-assertion');
  await expect(page.getByText('NOT CHECKED',{exact:true})).toHaveCount(0);
  await validationTab(page);await expect(page.getByRole('row').filter({hasText:'RECEIPT-TOTAL'})).toContainText('FAIL');await noApproval(page);
});

test('M3B receipt missing tax remains NOT_CHECKED',async({page},info)=>{
  await signIn(page);const {report}=await upload(page,'receipt-missing-tax.pdf',info);expect(report.validationStatus).toBe('REVIEW_REQUIRED');
  await validationTab(page);await expect(page.getByRole('row').filter({hasText:'RECEIPT-TOTAL'})).toContainText('NOT CHECKED');await noApproval(page);
});

test('M3B bill period error and reconciliation states stay distinct',async({page},info)=>{
  await signIn(page);const {report}=await upload(page,'bill-bad-period.pdf',info);expect(report.status).toBe('EXCEPTION');
  await validationTab(page);await expect(page.getByRole('row').filter({hasText:'BILL-DATES'})).toContainText('medium');
  await expect(page.getByRole('row').filter({hasText:'BILL-AMOUNT_DUE'})).toContainText('NOT CHECKED');await noApproval(page);
});

test('saved correction reload original retention and real stale 409',async({page},info)=>{
  await signIn(page,1);const {id,extraction}=await upload(page,'correction.pdf',info);
  const stale=await page.context().newPage();await stale.goto('/company/documents/'+id);
  stale.on('pageerror',error=>pageErrors.push(error.message));
  stale.on('console',message=>{if(message.type()==='error'||message.type()==='warning')consoleErrors.push(message.text());});
  await expect(stale.getByRole('textbox',{name:'Total',exact:true})).toHaveValue('99.00');
  await page.getByRole('textbox',{name:'Total',exact:true}).fill('50.00');
  const saved=page.waitForResponse(r=>r.url().endsWith('/extraction/total')&&r.request().method()==='PATCH');
  await page.getByRole('button',{name:'Save Total',exact:true}).click();const saveResponse=await saved;expect(saveResponse.status()).toBe(200);
  expect(saveResponse.request().postDataJSON().expectedContentRevision).toBe(extraction.contentRevision);
  const correction=await saveResponse.json();expect(correction.contentRevision).toBe(extraction.contentRevision+1);
  await stale.getByRole('textbox',{name:'Total',exact:true}).fill('49.00');
  const conflict=stale.waitForResponse(r=>r.url().endsWith('/extraction/total')&&r.request().method()==='PATCH');
  await stale.getByRole('button',{name:'Save Total',exact:true}).click();expect((await conflict).status()).toBe(409);
  await expect(stale.getByText(/your draft is retained/)).toBeVisible();
  await expect(stale.getByRole('textbox',{name:'Total',exact:true})).toHaveValue('49.00');
  await expect(stale.getByRole('button',{name:'Save Total',exact:true})).toBeDisabled();await shot(stale,info,'stale-409');
  await page.getByRole('button',{name:'Save & revalidate',exact:true}).click();
  await expect(page.getByText('PASS',{exact:true}).first()).toBeVisible();await page.reload();
  await expect(page.getByRole('textbox',{name:'Total',exact:true})).toHaveValue('50.00');
  await expect(page.getByText('Content revision '+correction.contentRevision,{exact:true})).toBeVisible();
  const after=await(await page.request.get('/api/documents/'+id+'/extraction')).json();
  const total=after.fields.find((field:{key:string})=>field.key==='total');
  expect(total.normalizedValue).toBe('99.00');expect(total.currentValue).toBe('50.00');
  expect(total.rawValue).toBe(extraction.fields.find((field:{key:string})=>field.key==='total').rawValue);
  await expect(page.getByRole('textbox',{name:'Total',exact:true}).locator('..')).toContainText('Extracted: 99.00');
  const report=await(await page.request.get('/api/documents/'+id+'/validation')).json();
  expect(report.validationStatus).toBe('PASS');expect(report.reviewRequired).toBe(true);expect(report.accountingApprovalPerformed).toBe(false);
  record('correction',{id,revision:correction.contentRevision,original:'99.00',current:'50.00',stale:409});
  await shot(page,info,'corrected-reloaded');await stale.close();
});

test('Open original source uses an authenticated real PDF tab',async({page},info)=>{
  await signIn(page);
  const evidence=JSON.parse(readFileSync(join(output,'evidence.json'),'utf8'));
  const id=evidence['valid.pdf'].id as string;
  await page.goto('/company/documents/'+id);
  const link=page.getByRole('link',{name:'Open original source',exact:true});await expect(link).toBeVisible();
  const response=page.context().waitForEvent('response',{predicate:r=>r.url().includes('/api/documents/'+id+'/file')});
  const opened=page.waitForEvent('popup');await link.click();const popup=await opened;
  expect((await response).status()).toBe(200);
  await expect(popup).toHaveURL(new RegExp('/api/documents/'+id+'/file'));
  await popup.waitForLoadState('domcontentloaded');
  await shot(popup,info,'original-source-tab');
  record('original-source-tab',{id,http:200,popupOpened:true,nativeVisualRendering:'inspect screenshot; not inferred from HTTP'});
  await popup.close();
});
