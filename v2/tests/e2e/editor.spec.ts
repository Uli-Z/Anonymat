import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = pathToFileURL(resolve('dist/index.html')).href;

test.setTimeout(12000);
test.beforeEach(async ({ page }) => {
  // Existing editor tests exercise session-only edits; consent has its own flow tests.
  await page.addInitScript(() => localStorage.setItem('anonymat-learning-consent-v1','off'));
  await page.goto(html);
});

async function reveal(page:import('@playwright/test').Page):Promise<void>{
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeEnabled();
}
async function openReplacements(page:import('@playwright/test').Page):Promise<void>{
  await page.getByRole('button',{name:/Ersetzungen anzeigen/}).click();
  await expect(page.getByRole('dialog',{name:'Erkannte Angaben'})).toBeVisible();
}
async function closeReplacements(page:import('@playwright/test').Page):Promise<void>{
  await page.getByRole('button',{name:'Ersetzungen schließen'}).click();
}

test('automatic highlights open an inline context menu and can be ignored', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Frau Anna Müller, anna@example.org');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(2);
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);

  await page.locator('.cm-anonymat-auto').first().click();
  await expect(page.getByRole('dialog', { name: 'Markierung bearbeiten' })).toBeVisible();
  await page.getByRole('button', { name: /Nur diese Stelle ignorieren/ }).click();
  await expect(page.locator('.cm-anonymat-ignored')).toHaveCount(1);
  await reveal(page);
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
  console.log('DEBUG_SELECTION', await page.evaluate(() => ({
    domSelection: window.getSelection()?.toString(),
    appRange: document.querySelector('.app-shell')?.getAttribute('data-debug-selection'),
    appPopup: document.querySelector('.app-shell')?.getAttribute('data-debug-popover'),
    popoverCount: document.querySelectorAll('.selection-popover').length,
    activeElement: document.activeElement?.className
  })));

  await page.locator('.selection-popover').getByRole('button', { name: /Sonstiges/ }).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(1);
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('FREIGABE');
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(1);

  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('Neuer Satz. ');
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('FREIGABE');

  await page.locator('.cm-anonymat-manual').click();
  await page.getByRole('button', { name: /Manuelle Erkennungsregel entfernen/ }).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(0);
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(0);
});


test('a name learned from a salutation is masked at every later occurrence', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Frau Müller ist hier. Müller ist auch da.');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(2);
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);
  await expect(page.locator('.preview')).toContainText('Frau [PERSON_001] ist hier. [PERSON_001] ist auch da.');
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);
  await expect(page.locator('.findings-list .count-inline')).toContainText('2');

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
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);

  await page.locator('.cm-anonymat-auto').first().click();
  await page.getByRole('button', { name: /Begriff im ganzen Text ignorieren/ }).click();
  await expect(page.locator('.cm-anonymat-ignored')).toHaveCount(3);
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(0);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);

  await openReplacements(page);
  await page.locator('.findings-list input[type="checkbox"]').check();
  await closeReplacements(page);
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(3);
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(3);
});

test('selecting an unknown word learns repeated words throughout the document', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Bitte FREIGABE und später FREIGABE.');
  // Wait for the initial scan and select the second occurrence from the end.
  // The contextual selection popover works equally with keyboard and pointer.
  await expect(page.getByRole('button', {name:/Ergebnis prüfen/})).toBeEnabled();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowLeft'); // period
  for (let i = 0; i < 'FREIGABE'.length; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.locator('.selection-popover').getByRole('button', {name:/Sonstiges/}).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveCount(2);
  await reveal(page);
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
  await reveal(page);
  await expect(page.locator('.preview')).toContainText(
    'Frau [FIRST_NAME_001] [LAST_NAME_001] antwortete. [LAST_NAME_001] bestätigte.'
  );
});

test('editing a replacement token keeps restoration working after French AI text', async ({ page }) => {
  await page.locator('.cm-content').fill('Frau Müller antwortete.');
  await openReplacements(page);
  await page.getByRole('button', {name:'Ersatzwert für Müller bearbeiten'}).click();
  await page.getByRole('textbox', {name:'Ersatzwert für Müller'}).fill('[PATIENT_A]');
  await page.getByRole('button', {name:'Speichern'}).click();
  await closeReplacements(page);
  await reveal(page);
  await expect(page.locator('.preview')).toContainText('Frau [PATIENT_A] antwortete.');
  await page.getByRole('textbox', {name:'KI-Antwort mit Platzhaltern'})
    .fill('Madame [PATIENT_A] a répondu.');
  await expect(page.locator('.restore-preview')).toContainText('Madame Müller a répondu.');
});


test('manual selection offers named categories in one popover, without a second toolbar', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Bitte CODEWORT');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for (let i = 0; i < 'CODEWORT'.length; i++) await page.keyboard.press('Shift+ArrowLeft');

  const popover = page.getByRole('dialog', {name:'Textauswahl anonymisieren'});
  await expect(popover).toBeVisible();
  await expect(page.locator('.selection-toolbar')).toHaveCount(0);
  await expect(popover.getByRole('button', {name:/Sonstiges/})).toBeVisible();
  await expect(popover.getByRole('button', {name:'Name',exact:true})).toBeVisible();
  await expect(popover.getByRole('combobox',{name:'Weitere Kategorien'})).toBeVisible();
  await popover.getByRole('button', {name:'Name',exact:true}).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('CODEWORT');
  await reveal(page);
  await expect(page.locator('.preview')).toContainText('[PERSON_001]');
});

test('selection popover follows visible text when the editor itself scrolls', async ({page}) => {
  const lines = Array.from({length: 65},(_,i)=> 'Abschnitt ' + i);
  lines[59] = 'Sonderwort';
  await page.locator('.cm-content').fill(lines.join('\n'));
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for(let i=0;i<5;i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  for(let i=0;i<'Sonderwort'.length;i++) await page.keyboard.press('Shift+ArrowLeft');

  const popover = page.getByRole('dialog',{name:'Textauswahl anonymisieren'});
  await expect(popover).toBeVisible();
  const before = await popover.boundingBox();
  await page.locator('.cm-scroller').evaluate(scroller => {scroller.scrollTop -= 22;});
  await expect.poll(async()=> (await popover.boundingBox())?.y).not.toBe(before?.y);
  await popover.getByRole('button',{name:/Sonstiges/}).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('Sonderwort');
});

test('help opens a concise FAQ without repeating privacy badges', async ({page}) => {
  await page.getByRole('button',{name:'Hilfe & FAQ'}).click();
  const faq = page.getByRole('dialog',{name:'Hilfe & FAQ'});
  await expect(faq).toBeVisible();
  await expect(faq).toContainText('Was bedeuten die Markierungsfarben?');
  await expect(faq).toContainText('Ist das Ergebnis wirklich anonym?');
  await page.getByRole('button',{name:'Hilfe schließen'}).click();
  await expect(faq).not.toBeVisible();
});
