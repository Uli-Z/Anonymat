import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = pathToFileURL(resolve('dist/index.html')).href;

test.use({ locale: 'de-DE' });

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('anonymat-first-run-ack-v2','accepted'));
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
  await expect(settings.locator('#partial-reference-year')).toHaveCount(0);
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

test('yearless day/month shifts automatically and restores without a reference-year field',async({page})=>{
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  const settings=page.locator('dialog.settings-dialog');
  await expect(settings.locator('#partial-reference-year')).toHaveCount(0);
  await settings.locator('#date-shift-mode').selectOption('manual');
  await settings.locator('#date-offset').fill('30');
  await settings.getByRole('button',{name:'Schließen',exact:true}).click();

  await page.locator('.cm-content').fill('Der Termin ist am 11. November.');
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview')).toContainText('11. Dezember');
  await expect(page.locator('.preview')).not.toContainText('[DATE');
  await page.getByRole('button',{name:'Text kopieren'}).click();
  await page.getByRole('button',{name:'KI-Antwort einfügen'}).click();
  await page.getByRole('textbox',{name:'KI-Antwort mit Platzhaltern'}).fill('Le rendez-vous est le 11 décembre.');
  await expect(page.locator('.restore-preview')).toContainText('11 novembre');
});

test('source editor stays the same height while findings change',async({page})=>{
  const editor=page.locator('.marked-editor');
  const input=page.locator('.cm-content');
  const height=await editor.evaluate(el=>el.getBoundingClientRect().height);
  await input.fill('Frau Anna Müller, anna@example.org');
  await expect(page.getByRole('button',{name:/Ergebnis prüfen/})).toBeEnabled();
  const heightAfter=await editor.evaluate(el=>el.getBoundingClientRect().height);
  expect(Math.abs(heightAfter-height)).toBeLessThan(2);
  await expect(page.locator('dialog.findings-dialog')).not.toBeVisible();
  await expect(page.locator('.preview .placeholder-token')).toHaveCount(0);
  await page.getByRole('button',{name:/Ersetzungen anzeigen/}).click();
  await expect(page.getByRole('dialog',{name:'Erkannte Angaben'})).toBeVisible();
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(2);
  await page.getByRole('button',{name:'Ersetzungen schließen'}).click();
  await expect(page.locator('dialog.findings-dialog')).not.toBeVisible();
});

test('number detection toggle persists and affects the next text',async({page})=>{
  const settings=page.locator('dialog.settings-dialog');
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  const numbers=settings.getByRole('checkbox',{name:'Zahlen',exact:true});
  await expect(numbers).toBeChecked();
  await expect(settings.getByRole('checkbox',{name:'IBAN'})).toBeVisible();
  await expect(settings.locator('.detection-category-option')).toHaveCount(18);
  await expect(settings.locator('details').filter({hasText:'Weitere Kategorien einzeln einstellen'})).toHaveCount(0);
  await numbers.uncheck();
  await settings.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.locator('.cm-content').fill('Die Länge beträgt 128 cm.');
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview')).toContainText('128 cm');
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await expect(numbers).not.toBeChecked();
  await numbers.check();
  await settings.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.locator('.cm-content').fill('Die Länge beträgt 128 cm.');
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview')).toContainText('[NUMBER_001] cm');
});
