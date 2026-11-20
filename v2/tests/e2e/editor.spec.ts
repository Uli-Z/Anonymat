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
  await page.getByRole('button', { name: /Nur diese Stelle ignorieren/ }).click();
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

  await page.locator('.selection-toolbar').getByRole('button', { name: /Auswahl anonymisieren/ }).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(1);
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('FREIGABE');
  await expect(page.locator('.placeholder-token')).toHaveCount(1);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('Neuer Satz. ');
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('FREIGABE');

  await page.locator('.cm-anonymat-manual').click();
  await page.getByRole('button', { name: /Manuelle Erkennungsregel entfernen/ }).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(0);
  await expect(page.locator('.placeholder-token')).toHaveCount(0);
});


test('a name learned from a salutation is masked at every later occurrence', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Frau Müller ist hier. Müller ist auch da.');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(2);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);
  await expect(page.locator('.preview')).toContainText('Frau [PERSON_001] ist hier. [PERSON_001] ist auch da.');
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);
  await expect(page.locator('.count-inline')).toContainText('2');

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Müller!');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(3);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);
});

test('ignoring one occurrence never creates a phantom entry, but global ignore handles all', async ({ page }) => {
  await page.locator('.cm-content').fill('Frau Müller, Müller und Müller.');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(3);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);

  await page.locator('.cm-anonymat-auto').nth(1).click();
  await page.getByRole('button', { name: /Nur diese Stelle ignorieren/ }).click();
  await expect(page.locator('.cm-anonymat-ignored')).toHaveCount(1);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);

  await page.locator('.cm-anonymat-auto').first().click();
  await page.getByRole('button', { name: /Begriff im ganzen Text ignorieren/ }).click();
  await expect(page.locator('.cm-anonymat-ignored')).toHaveCount(3);
  await expect(page.locator('.placeholder-token')).toHaveCount(0);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);

  await page.locator('.findings-list input[type="checkbox"]').check();
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(3);
  await expect(page.locator('.placeholder-token')).toHaveCount(3);
});

test('selecting an unknown word offers one-click masking and learns repeated words', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Bitte FREIGABE und später FREIGABE.');
  const line = page.locator('.cm-line').first();
  const coords = await line.evaluate((node) => {
    const text = node.firstChild as Text;
    const start = text.textContent!.indexOf('FREIGABE');
    const pos = (offset: number) => {
      const range = document.createRange();
      range.setStart(text, offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      return { x: rect.left, y: rect.top + rect.height / 2 };
    };
    return {from: pos(start), to: pos(start + 'FREIGABE'.length)};
  });
  await page.mouse.move(coords.from.x, coords.from.y);
  await page.mouse.down();
  await page.mouse.move(coords.to.x, coords.to.y, {steps: 14});
  await page.mouse.up();

  await expect(page.locator('.selection-popover')).toBeVisible();
  await page.locator('.selection-popover').getByRole('button', {name: /Auswahl anonymisieren/}).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(2);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' FREIGABE');
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(3);
});


test('user can split an automatically detected full name into first and last name', async ({ page }) => {
  await page.locator('.cm-content').fill('Frau Anna Müller antwortete. Müller bestätigte.');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(2);
  await page.locator('.cm-anonymat-auto').first().click();
  await page.getByRole('button', {name:/In Vorname und Nachname aufteilen/}).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(3);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(2);
  await expect(page.locator('.preview')).toContainText(
    'Frau [FIRST_NAME_001] [LAST_NAME_001] antwortete. [LAST_NAME_001] bestätigte.'
  );
});

test('editing a replacement token keeps restoration working after French AI text', async ({ page }) => {
  await page.locator('.cm-content').fill('Frau Müller antwortete.');
  await page.getByRole('button', {name:'Ersatzwert für Müller bearbeiten'}).click();
  await page.getByRole('textbox', {name:'Ersatzwert für Müller'}).fill('[PATIENT_A]');
  await page.getByRole('button', {name:'Speichern'}).click();
  await expect(page.locator('.preview')).toContainText('Frau [PATIENT_A] antwortete.');
  await page.getByRole('textbox', {name:'KI-Antwort mit Platzhaltern'})
    .fill('Madame [PATIENT_A] a répondu.');
  await expect(page.locator('.restore-preview')).toContainText('Madame Müller a répondu.');
});
