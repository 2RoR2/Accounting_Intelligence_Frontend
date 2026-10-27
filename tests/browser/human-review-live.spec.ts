import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import type { ExtractionResponse } from '../../src/lib/api/document-contract';

// Opt-in, read-only document acceptance. Only authentication is persisted.
// Never seeds/uploads/corrects/revalidates the running demo's documents.
test('genuine Human Review images, evidence, responsive layout and retained history', async ({ page }, info) => {
  test.skip(!process.env.REVIEW_ACCOUNTS_PATH || !process.env.REVIEW_DOCUMENT_IDS, 'Provide local test-account path and genuine document IDs.');
  const account = JSON.parse(readFileSync(process.env.REVIEW_ACCOUNTS_PATH!, 'utf8')).find((a: { role: string }) => a.role === 'accountant');
  const ids = process.env.REVIEW_DOCUMENT_IDS!.split(',');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.getByRole('button', { name: 'Continue with email', exact: true }).click();
  await expect(page.getByLabel('Authenticator digit 1', { exact: true })).toBeVisible();
  let code: string | undefined;
  await expect.poll(async () => {
    const list = await (await page.request.get(`${process.env.REVIEW_MAILBOX_URL ?? 'http://127.0.0.1:58027'}/api/v1/messages`)).json();
    const message = list.messages.find((m: { To: { Address: string }[] }) => m.To.some(r => r.Address === account.email));
    if (message) {
      const body = await (await page.request.get(`${process.env.REVIEW_MAILBOX_URL ?? 'http://127.0.0.1:58027'}/api/v1/message/${message.ID}`)).json();
      code = body.Text.match(/\b\d{6}\b/)?.[0];
    }
    return !!code;
  }, { timeout: 15000 }).toBe(true);
  for (let i = 0; i < 6; i++) await page.getByLabel('Authenticator digit ' + (i + 1), { exact: true }).fill(code![i]);
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Continue to workspace', exact: true })).toBeVisible();
  const findings: unknown[] = [];
  for (const id of ids) {
    await page.goto(`/workspace/documents/${id}`);
    await expect(page.getByRole('button', { name: 'Fit to page', exact: true })).toBeEnabled();
    const response = await page.request.get(`/api/documents/${id}/extraction`);
    expect(response.status()).toBe(200);
    const before: ExtractionResponse = await response.json();
    const name = await page.locator('main h1').innerText();
    for (const size of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1093, height: 614 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.getByRole('button', { name: 'Fit to page', exact: true }).click();
      await expect.poll(() => page.locator('.image-viewer-viewport').evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const metrics = await page.locator('.image-viewer-page img').evaluate((e: HTMLImageElement) => ({ natural: [e.naturalWidth, e.naturalHeight], displayed: [e.clientWidth, e.clientHeight] }));
      const labelSize = await page.locator('.shoebox-label').first().evaluate(e => getComputedStyle(e).fontSize);
      expect(parseFloat(labelSize)).toBeGreaterThanOrEqual(16);
      findings.push({ name, viewport: size, ...metrics, labelSize, fitWithoutOverflow: true });
      if (size.width === 390) {
        await page.locator('.shoebox-fields > .shoebox-field input').first().click();
        await expect(page.locator('.shoebox-mobile-evidence').first()).toBeVisible();
        await page.screenshot({ path: info.outputPath(name + '-mobile-fields.png') });
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    const first = page.locator('.shoebox-fields > .shoebox-field').first();
    await first.locator('input').click();
    await expect(page.getByRole('region', { name: 'Source evidence', exact: true })).toContainText('Selected field evidence:');
    const originalField = before.fields?.[0];
    if (originalField?.evidence?.[0]?.text) await expect(page.locator('.selected-source-evidence')).toContainText(originalField.evidence[0].text);
    await first.locator('summary').click();
    await expect(first).toContainText(originalField?.rawValue ?? 'Not provided');
    await expect(first).toContainText('Saved current value');
    await expect(first).toContainText(originalField?.confidence == null ? 'Not available' : String(originalField.confidence));
    await page.locator('.shoebox-split').evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 16));
    await page.screenshot({ path: info.outputPath(name + '-1366-fit.png') });
    const fitWidth = await page.locator('.image-viewer-page').evaluate(e => e.clientWidth);
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    expect(await page.locator('.image-viewer-page').evaluate(e => e.clientWidth)).toBeGreaterThan(fitWidth * 4);
    await page.screenshot({ path: info.outputPath(name + '-zoom.png') });
    await expect.poll(() => page.locator('.image-viewer-viewport').evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
    const enlargedWidth = await page.locator('.image-viewer-page').evaluate(e => e.clientWidth);
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    expect(await page.locator('.image-viewer-page').evaluate(e => e.clientWidth)).toBeLessThan(enlargedWidth);
    await page.getByRole('button', { name: 'Fit to page', exact: true }).press('Enter');
    await expect(page.locator('.image-viewer-controls output')).toContainText('Fit');
    await expect.poll(() => page.locator('.image-viewer-viewport').evaluate(e => e.scrollLeft === 0 && e.scrollTop === 0 && e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.getByText('Correct line items', { exact: true }).click();
    if (before.lineCorrections?.length) {
      await page.getByText('Line correction history', { exact: true }).click();
      for (const correction of before.lineCorrections) await expect(page.locator('.shoebox-lines')).toContainText(correction.corrected_by);
    }
    await page.reload();
    await expect(page.getByRole('button', { name: 'Fit to page', exact: true })).toBeEnabled();
    const after = await (await page.request.get(`/api/documents/${id}/extraction`)).json();
    expect(after).toEqual(before);
  }
  // Exercise failure handling without sending a correction to the demo database.
  const field = page.locator('.shoebox-fields > .shoebox-field').first();
  const input = field.locator('input');
  const originalValue = await input.inputValue();
  const draft = originalValue + ' acceptance draft';
  let attemptedWrites = 0;
  await page.route('**/api/documents/*/extraction/*', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    attemptedWrites++;
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'Acceptance test: stale revision.' }) });
  });
  await input.fill(draft);
  await field.getByRole('button', { name: /^Save / }).click();
  await expect(field.getByRole('alert')).toContainText('your draft is retained');
  await expect(input).toHaveValue(draft);
  await expect(field.getByRole('button', { name: /^Save / })).toBeDisabled();
  expect(attemptedWrites).toBe(1);
  await page.unroute('**/api/documents/*/extraction/*');
  await page.reload();
  await expect(page.locator('.shoebox-fields > .shoebox-field input').first()).toHaveValue(originalValue);
  const documents = await (await page.request.get('/api/documents')).json();
  const pdf = documents.find((doc: { name: string; status: string }) => /\.pdf$/i.test(doc.name) && !['UPLOADED', 'QUEUED', 'PROCESSING', 'FAILED'].includes(doc.status));
  if (pdf) {
    await page.goto(`/workspace/documents/${pdf.id}`);
    await expect(page.getByTitle('Original document')).toHaveAttribute('src', new RegExp(`/api/documents/${pdf.id}/file`));
    expect((await page.request.get(`/api/documents/${pdf.id}/file`)).headers()['content-type']).toContain('application/pdf');
    findings.push({ pdfViewer: 'existing PDF iframe and source endpoint verified', documentId: pdf.id });
  } else findings.push({ pdfViewer: 'No processed PDF is accessible in this test tenant; iframe path retained in source.' });
  expect(errors).toEqual([]);
  const report = JSON.stringify({ authentication: 'real login and email MFA; no injected cookies', documentMutations: 0, simulatedFailure: '409 only; one intercepted PATCH, draft retained, no automatic replay', findings }, null, 2);
  writeFileSync(info.outputPath('acceptance-findings.json'), report);
  await info.attach('acceptance-findings', { body: report, contentType: 'application/json' });
});
