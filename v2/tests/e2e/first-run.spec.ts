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

test.describe('language picker inside initial warning', () => {
  test.use({ locale: 'de-DE' });

  test('shows only a flag until opened and labels automatic German explicitly', async ({ page }) => {
    await page.goto(html);
    const notice = page.locator('dialog.first-run-dialog');
    const trigger = notice.locator('.first-run-language-toggle');
    const menu = notice.locator('.first-run-language-menu');
    await expect(trigger).toHaveAttribute('aria-label', 'Sprache ändern');
    await expect(trigger).toContainText('🇩🇪');
    await expect(menu).not.toBeVisible();
    await expect(notice.locator('.first-run-symbol')).toBeVisible();

    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('.first-run-language-choice').first()).toContainText('Automatisch (Deutsch)');
    await expect(menu.locator('.first-run-language-choice').first()).toHaveAttribute('aria-pressed','true');
    await expect(menu).toContainText('🇬🇧');
    await expect(notice).toHaveAttribute('aria-labelledby', 'first-run-title');

    await menu.getByRole('button', { name: /English/ }).click();
    await expect(menu).not.toBeVisible();
    await expect(trigger).toContainText('🇬🇧');
    await expect(notice.getByRole('heading', { name: 'Important information about pseudonymization' })).toBeVisible();
    await expect(notice).toContainText('The result is not automatically anonymous.');
    await expect(notice.getByRole('checkbox', { name: 'I have read and understood this information.' })).not.toBeChecked();
    await expect(notice.getByRole('button', { name: 'I understand – Start Anonymat' })).toBeDisabled();

    await page.reload();
    await expect(notice.getByRole('heading', { name: 'Important information about pseudonymization' })).toBeVisible();
    await trigger.click();
    await expect(menu.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed','true');
    await expect(menu.getByRole('button', { name: /Automatic \(German\)/ })).toBeVisible();

    await menu.getByRole('button', { name: /Automatic \(German\)/ }).click();
    await expect(notice.getByRole('heading', { name: 'Wichtiger Hinweis zur Pseudonymisierung' })).toBeVisible();
    await trigger.click();
    await expect(menu.getByRole('button', { name: /Automatisch \(Deutsch\)/ })).toHaveAttribute('aria-pressed','true');

    await menu.getByRole('button', { name: /English/ }).click();
    await notice.getByRole('checkbox', { name: 'I have read and understood this information.' }).check();
    await notice.getByRole('button', { name: 'I understand – Start Anonymat' }).click();
    await page.getByRole('button', { name: 'Open settings' }).click();
    const settings = page.locator('#ui-language');
    await expect(settings).toHaveValue('en');
    await expect(settings.locator('option[value="auto"]')).toContainText('Automatic (German)');
    await expect(settings.locator('option[value="de"]')).toContainText('🇩🇪 Deutsch');
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
    await notice.locator('.first-run-language-toggle').click();
    await expect(notice.locator('.first-run-language-menu')).toContainText('Automatic (English)');
    await expect(notice.locator('.first-run-language-choice[aria-pressed="true"]')).toContainText('Automatic (English)');
    await notice.locator('.first-run-language-toggle').click();
    const start = notice.getByRole('button', { name: 'I understand – Start Anonymat' });
    await expect(start).toBeDisabled();
    await notice.getByRole('checkbox', { name: 'I have read and understood this information.' }).check();
    await start.click();
    await expect(notice).not.toBeVisible();
  });
});
