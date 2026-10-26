import test from "node:test";
import assert from "node:assert/strict";
import { mapExtraction, fieldLabel } from "../src/lib/api/document-contract";
test("qualitative source warnings survive mapping without invented confidence", () => {
  const result = mapExtraction({documentId:"synthetic", warnings:[{code:"NO_MAPPED_LINE_ITEMS",message:"Inspect source"}],
    fields:[{key:"date",state:"ambiguous",confidence:null,value:null,confirmationRequired:true,
      warnings:[{code:"AMBIGUOUS_DATE",message:"Confirm date"}]}]});
  assert.equal(result.fields.date.confidence,null);
  assert.equal(result.fields.date.warnings?.[0].code,"AMBIGUOUS_DATE");
  assert.equal(result.fields.date.confirmationRequired,true);
  assert.equal(result.warnings?.length,1);
});
test("bill total and amount due have distinct accountant labels", () => {
  assert.equal(fieldLabel("BILL","total"),"Bill total");
  assert.equal(fieldLabel("BILL","amount_due"),"Amount due");
});

test("line correction keeps the displayed revision and exact string value", async () => {
  const {updateExtractedLineItem} = await import("../src/lib/api/document.service");
  const previous = globalThis.fetch; let url = ""; let body = "";
  globalThis.fetch = async (input, init) => {url=String(input); body=String(init?.body); return Response.json({lineItemId:"line",fieldKey:"quantity",value:"1.000",correctedBy:"actor",contentRevision:8});};
  try {
    await updateExtractedLineItem({role:"ACCOUNTANT"} as import("../src/types").User,"synthetic","line","quantity","1",7);
    assert.match(url,/line-items\/line\/quantity$/);
    assert.deepEqual(JSON.parse(body),{value:"1",expectedContentRevision:7});
  } finally {globalThis.fetch=previous;}
});
test("image upload sends original bytes while unsupported financial-document formats are refused", async () => {
  const {uploadDocument} = await import("../src/lib/api/document.service");
  const previous=globalThis.fetch; let file: File | undefined;
  globalThis.fetch=async (_input,init)=>{file=(init?.body as FormData).get("file") as File;return Response.json({id:"synthetic",kind:"RECEIPT"});};
  try {
    const user={role:"ACCOUNTANT"} as import("../src/types").User;
    await uploadDocument(user,new File([new Uint8Array([255,216,255])],"synthetic.jpg",{type:"image/jpeg"}),"real","ACCOUNTS_PAYABLE","RECEIPT");
    assert.equal(file?.type,"image/jpeg");assert.equal(file?.size,3);
    await assert.rejects(uploadDocument(user,new File(["x"],"synthetic.csv"),"real"));
  } finally {globalThis.fetch=previous;}
});
test("line states, warnings and persisted actor history survive response mapping",()=>{
  const history={line_item_id:"line",field_key:"quantity",old_value:null,new_value:"1",corrected_by:"actor",corrected_at:"2026-10-27T00:00:00Z"};
  const result=mapExtraction({documentId:"synthetic",lineCorrections:[history],lineItems:[{id:"line",quantity:"1.000",fieldStates:{quantity:"missing"},guidance:{quantity:{warnings:[{code:"MISSING_VALUE",message:"Inspect source"}]}}}]});
  assert.deepEqual(result.lineCorrections,[history]);
  assert.equal(result.lineItems[0].fieldStates?.quantity,"missing");
  assert.equal(result.lineItems[0].guidance?.quantity.warnings?.[0].code,"MISSING_VALUE");
});
