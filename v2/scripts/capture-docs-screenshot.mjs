// Reproducible documentation screenshot of the actual offline application.
// Only synthetic data is entered; no AI service or external data is contacted.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve(process.argv[2] ?? '../docs/app-preview.png');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1050 },
    deviceScaleFactor: 1,
    locale: 'en-GB',
    colorScheme: 'light'
  });
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  const welcome = page.locator('.first-run-dialog');
  await expect(welcome).toBeVisible();
  await welcome.locator('input[type=checkbox]').check();
  await welcome.locator('button.primary-button').click();
  await expect(welcome).toBeHidden();

  const editor = page.locator('.cm-content');
  await editor.fill('Name: Anna Müller\nAdmission: 12.03.2026\nEmail: anna.mueller@example.org');
  const review = page.locator('.editor-actions .primary-button');
  await expect(review).toBeEnabled({ timeout: 30000 });
  await review.click();
  await expect(page.locator('.preview .placeholder-token').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.output-copy-button')).toBeEnabled();
  await expect(page.locator('.preview')).not.toContainText('anna.mueller@example.org');
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled' });
  console.log('Documentation screenshot saved: ' + output);
} finally {
  await browser.close();
}
