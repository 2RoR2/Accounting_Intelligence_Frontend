import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../src/components/common/ui";

test("Task A — Financial Display: money() currency, normalization, and unparseable handling", () => {
  // 1. Normalized numeric values with default MYR
  const myr50 = money("50.00");
  assert.ok(myr50.includes("50.00"), `Expected 50.00 in "${myr50}"`);
  assert.ok(myr50.includes("MYR") || myr50.includes("RM"), `Expected MYR/RM symbol in "${myr50}"`);

  // 2. Raw unparsed Docling string containing currency prefix
  const rawTotal = money("Total amount: MYR 50.00");
  assert.ok(!rawTotal.includes("NaN"), `Must not display RMNaN, got "${rawTotal}"`);
  assert.ok(rawTotal.includes("50.00"), `Expected 50.00 extracted from raw string, got "${rawTotal}"`);

  // 3. Different currencies (USD, EUR, SGD, GBP)
  const usdVal = money("1250.50", "USD");
  assert.ok(usdVal.includes("1,250.50") || usdVal.includes("1250.50"), `Expected 1250.50 in "${usdVal}"`);
  assert.ok(usdVal.includes("USD") || usdVal.includes("$"), `Expected USD symbol in "${usdVal}"`);

  const eurVal = money("89.90", "EUR");
  assert.ok(eurVal.includes("89.90"), `Expected 89.90 in "${eurVal}"`);
  assert.ok(eurVal.includes("EUR") || eurVal.includes("€"), `Expected EUR symbol in "${eurVal}"`);

  const sgdVal = money("340.00", "SGD");
  assert.ok(sgdVal.includes("340.00"), `Expected 340.00 in "${sgdVal}"`);
  assert.ok(sgdVal.includes("SGD") || sgdVal.includes("$"), `Expected SGD symbol in "${sgdVal}"`);

  // 4. Missing amounts (null, undefined, empty string)
  assert.equal(money(null), "—", "null amount must format as —");
  assert.equal(money(undefined), "—", "undefined amount must format as —");
  assert.equal(money(""), "—", "empty string must format as —");
  assert.equal(money("   "), "—", "whitespace-only string must format as —");

  // 5. Invalid / unparseable text
  assert.equal(money("Invalid non-numeric text"), "—", "Non-numeric string must format as —");
  assert.equal(money("NaN"), "—", "Literal NaN string must format as —");
  assert.equal(money(Number.NaN), "—", "NaN number must format as —");

  // 6. Corrected numeric values
  assert.ok(money("848.00").includes("848.00"), "Corrected 848.00 value formats properly");
  assert.ok(money(848.0).includes("848.00"), "Numeric 848 formats properly");
  assert.ok(money("2,193,713.00").includes("2,193,713.00"), "Comma separated numbers format properly");
});
