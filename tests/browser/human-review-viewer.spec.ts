import { test, expect, type Page } from '@playwright/test';

// Synthetic viewer regression: every API request stays in the browser.
// This does not claim live authentication, extraction or PDF raster rendering.
const documentId = '44444444-4444-4444-8444-444444444444';
const tenantId = '11111111-1111-4111-8111-111111111111';
const actor = '33333333-3333-4333-8333-333333333333';

function syntheticPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << >> >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function sourceFixture(page: Page, kind: 'png' | 'pdf', failFirstImage = false) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 1600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, 1200, 1600);
    context.fillStyle = '#000'; context.font = '48px sans-serif';
    context.fillText('SYNTHETIC VIEWER FIXTURE', 120, 320);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const source = kind === 'png' ? Buffer.from(png, 'base64') : syntheticPdf();
  const evidence = { page: kind === 'png' ? 1 : 2, text: 'Synthetic source text', coordinate_units: 'pixels', page_size: { width: 1200, height: 1600 }, bbox: { l: 120, t: 320, r: 600, b: 480, coord_origin: 'TOPLEFT' } };
  let fileRequests = 0;
  const writes: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      writes.push(request.method() + ' ' + path);
      return route.fulfill({ status: 403, json: { detail: 'Viewer test refuses mutations' } });
    }
    if (path === '/api/auth/me') return route.fulfill({ json: { id: actor, name: 'Synthetic Reviewer', email: 'viewer@example.test', role: 'ACCOUNTANT', tenantId, status: 'ACTIVE', mustChangePassword: false } });
    if (path === '/api/documents/' + documentId) return route.fulfill({ json: { id: documentId, name: 'synthetic-viewer.' + kind, tenantId, ownerId: actor, assignedTo: null, kind: 'INVOICE', status: 'EXTRACTED', contentRevision: 1, createdAt: '2026-10-27T00:00:00Z' } });
    if (path.endsWith('/extraction')) return route.fulfill({ json: { documentId, contentRevision: 1, classification: { value: 'invoice' }, fields: [{ key: 'supplier', label: 'Supplier', value: 'Synthetic Supplier', rawValue: 'Synthetic source text', normalizedValue: 'Synthetic Supplier', confidence: null, evidence: [evidence] }], lineItems: [] } });
    if (path.endsWith('/file')) {
      fileRequests++;
      if (failFirstImage && fileRequests === 1) return route.fulfill({ status: 503, body: '' });
      return route.fulfill({ contentType: kind === 'png' ? 'image/png' : 'application/pdf', body: source });
    }
    if (path.endsWith('/validation')) return route.fulfill({ json: { documentId, contentRevision: 1, validationStatus: 'PASS', results: [] } });
    if (path.endsWith('/reviews')) return route.fulfill({ json: { submissions: [], decisions: [] } });
    if (path.endsWith('/kind-workflow')) return route.fulfill({ json: { kind: 'invoice', fields: {}, overdue: false, duplicates: [], relatedNotes: [] } });
    return route.fulfill({ json: [] });
  });
  return { writes, requests: () => fileRequests };
}

test('synthetic PNG fits, zooms, maps evidence and retains a draft across image retry', async ({ page }, info) => {
  const fixture = await sourceFixture(page, 'png', true);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/workspace/documents/' + documentId);
  await expect(page.getByText('Original image could not be loaded. Your corrections are retained.')).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Supplier', exact: true });
  await input.fill('Unsaved synthetic draft');
  await page.getByRole('button', { name: 'Retry image', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fit to page', exact: true })).toBeEnabled();
  await expect(input).toHaveValue('Unsaved synthetic draft');
  await expect(page.locator('.image-evidence-box')).toHaveCount(1);
  expect(await page.locator('.image-evidence-box').evaluate(element => (element as HTMLElement).style.left)).toBe('10%');
  for (const size of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1093, height: 614 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.getByRole('button', { name: 'Fit to page', exact: true }).click();
    await expect.poll(() => page.locator('.image-viewer-viewport').evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (size.width === 390) {
      await input.click();
      await expect(page.locator('.shoebox-mobile-evidence')).toContainText('Synthetic source text');
    }
    await page.screenshot({ path: info.outputPath('synthetic-png-' + size.width + '.png') });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  const fitted = await page.locator('.image-viewer-page').evaluate(element => element.clientWidth);
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await page.locator('.image-viewer-page').evaluate(element => element.clientWidth)).toBeGreaterThan(fitted * 4);
  await page.getByRole('button', { name: 'Fit to page', exact: true }).press('Enter');
  await expect(page.locator('.image-viewer-controls output')).toContainText('Fit');
  await expect(input).toHaveValue('Unsaved synthetic draft');
  expect(fixture.requests()).toBe(2);
  expect(fixture.writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('synthetic PDF keeps the iframe, source link and selected evidence page', async ({ page }, info) => {
  const fixture = await sourceFixture(page, 'pdf');
  await page.goto('/workspace/documents/' + documentId);
  const frame = page.getByTitle('Original document', { exact: true });
  await expect(frame).toHaveAttribute('src', `/api/documents/${documentId}/file#view=FitH`);
  await page.getByRole('button', { name: 'View source for Supplier', exact: true }).click();
  await expect(frame).toHaveAttribute('src', `/api/documents/${documentId}/file#page=2`);
  await expect(page.getByRole('link', { name: 'Open original source', exact: true })).toHaveAttribute('href', `/api/documents/${documentId}/file#page=2`);
  await expect(page.locator('.selected-source-evidence')).toContainText('Synthetic source text');
  await expect(page.locator('.image-viewer-viewport')).toHaveCount(0);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(frame).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('synthetic-pdf-' + viewport.width + '.png') });
  }
  await expect.poll(fixture.requests).toBeGreaterThan(0);
  expect(fixture.writes).toEqual([]);
});
