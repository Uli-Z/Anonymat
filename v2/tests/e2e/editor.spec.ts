import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = pathToFileURL(resolve('dist/index.html')).href;

test.beforeEach(async ({ page }) => {
  // Test the actual standalone file, not only the Vite development server.
  await page.goto(html);
});

test('automatic highlights open an inline context menu and can be ignored', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Frau Anna Müller, anna@example.org');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(2);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);

  await page.locator('.cm-anonymat-auto').first().click();
  await expect(page.getByRole('dialog', { name: 'Markierung bearbeiten' })).toBeVisible();
  await page.getByRole('button', { name: /Diese Stelle ignorieren/ }).click();
  await expect(page.locator('.cm-anonymat-ignored')).toHaveCount(1);
  await expect(page.locator('.placeholder-token')).toHaveCount(1);

  await page.locator('.cm-anonymat-ignored').click();
  await page.getByRole('button', { name: /Wieder anonymisieren/ }).click();
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(2);
});

test('manual highlights persist after editing elsewhere and can be removed', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Bitte FREIGABE');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowLeft');

  await page.getByRole('button', { name: /Markieren/ }).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(1);
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('FREIGABE');
  await expect(page.locator('.placeholder-token')).toHaveCount(1);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('Neuer Satz. ');
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('FREIGABE');

  await page.locator('.cm-anonymat-manual').click();
  await page.getByRole('button', { name: /Platzhalter entfernen/ }).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(0);
  await expect(page.locator('.placeholder-token')).toHaveCount(0);
});
