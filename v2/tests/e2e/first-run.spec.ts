import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = pathToFileURL(resolve('dist/index.html')).href;
const acknowledgementKey = 'anonymat-first-run-ack-v2';

test.describe('initial warning in German', () => {
  test.use({ locale: 'de-DE' });

  test('requires active acknowledgement, cannot be skipped, and persists across reloads', async ({ page }) => {
    await page.goto(html);
    const notice = page.getByRole('dialog', { name: 'Wichtiger Hinweis zur Pseudonymisierung' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Das Ergebnis ist nicht automatisch anonym.');
    await expect(notice).toContainText('Prüfe jeden Ergebnistext vollständig');
    await expect(notice).toContainText('lokal im Browser');
    await expect(notice).toContainText('sendet diese Texte nicht an einen Server');

    const start = notice.getByRole('button', { name: 'Verstanden – Anonymat starten' });
    await expect(start).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(notice).toBeVisible();
    await expect(start).toBeDisabled();

    await notice.getByRole('checkbox', { name: 'Ich habe den Hinweis gelesen und verstanden.' }).check();
    await expect(start).toBeEnabled();
    await start.click();
    await expect(notice).not.toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), acknowledgementKey)).toBe('accepted');

    await page.reload();
    await expect(notice).not.toBeVisible();
    await page.evaluate(key => localStorage.removeItem(key), acknowledgementKey);
    await page.reload();
    await expect(notice).toBeVisible();
  });
});

test.describe('initial warning in English', () => {
  test.use({ locale: 'en-US' });

  test('respects the browser language for the entire warning', async ({ page }) => {
    await page.goto(html);
    const notice = page.getByRole('dialog', { name: 'Important information about pseudonymization' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('The result is not automatically anonymous.');
    await expect(notice).toContainText('does not send it to a server');
    const start = notice.getByRole('button', { name: 'I understand – Start Anonymat' });
    await expect(start).toBeDisabled();
    await notice.getByRole('checkbox', { name: 'I have read and understood this information.' }).check();
    await start.click();
    await expect(notice).not.toBeVisible();
  });
});
