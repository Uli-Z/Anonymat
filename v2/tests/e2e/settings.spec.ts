import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = pathToFileURL(resolve('dist/index.html')).href;

test.beforeEach(async ({page}) => {
  await page.goto(html);
});

test('date shifting is enabled and random without displaying the offset', async ({page}) => {
  await expect(page.locator('#date-offset')).toHaveCount(0);
  await expect(page.locator('#source-date-order')).toBeHidden();
  await page.getByRole('button', {name:'Einstellungen öffnen'}).click();
  const settings = page.locator('dialog.settings-dialog');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('checkbox', {name:/Kalenderdaten verschieben/})).toBeChecked();
  await expect(settings.locator('#date-shift-mode')).toHaveValue('random');
  await expect(settings.locator('#date-offset')).toHaveCount(0);
  await settings.getByRole('button', {name:'Neuen Zufallswert wählen'}).click();
  await settings.locator('#date-shift-mode').selectOption('manual');
  await expect(settings.locator('#date-offset')).toBeVisible();
  await settings.locator('#date-offset').fill('42');
  await expect(settings.locator('#date-offset')).toHaveValue('42');
  await settings.locator('#date-shift-mode').selectOption('random');
  await expect(settings.locator('#date-offset')).toHaveCount(0);
  await settings.getByRole('button', {name:'Schließen', exact:true}).click();
  await expect(settings).not.toBeVisible();
});

test('new text restores the default automatic date shift', async ({page}) => {
  await page.getByRole('button', {name:'Einstellungen öffnen'}).click();
  const settings = page.locator('dialog.settings-dialog');
  await settings.getByRole('checkbox', {name:/Kalenderdaten verschieben/}).uncheck();
  await settings.getByRole('button', {name:'Schließen', exact:true}).click();
  await page.locator('.cm-content').fill('Bitte prüfen');
  await page.getByRole('button', {name:/Neuer Text/}).click();
  await page.getByRole('button', {name:'Einstellungen öffnen'}).click();
  await expect(settings.getByRole('checkbox', {name:/Kalenderdaten verschieben/})).toBeChecked();
  await expect(settings.locator('#date-shift-mode')).toHaveValue('random');
});
