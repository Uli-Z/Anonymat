import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = pathToFileURL(resolve('dist/index.html')).href;

test.use({ locale: 'de-DE' });

test.beforeEach(async ({ page }) => {
  // Existing editor tests exercise session-only edits; consent has its own flow tests.
  await page.addInitScript(() => localStorage.setItem('anonymat-learning-consent-v1','off'));
  await page.addInitScript(() => localStorage.setItem('anonymat-first-run-ack-v2','accepted'));
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
  await page.getByRole('button', { name: /Nur diese Stelle nicht ersetzen/ }).click();
  await expect(page.locator('.cm-anonymat-hit')).toHaveCount(1);
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(1);
  await openReplacements(page);
  await page.locator('.finding-row').filter({hasText:'Anna Müller'}).getByRole('checkbox').check();
  await closeReplacements(page);
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(2);
});

test('manual highlights persist after editing elsewhere and can be removed', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.fill('Bitte FREIGABE');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowLeft');

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
  await page.getByRole('button', { name: /Nur diese Stelle nicht ersetzen/ }).click();
  await expect(page.locator('.cm-anonymat-hit')).toHaveCount(2);
  await expect(page.locator('.findings-list .finding-row')).toHaveCount(1);
  await reveal(page);
  await expect(page.locator('.placeholder-token')).toHaveCount(2);

  await page.locator('.cm-anonymat-auto').first().click();
  await page.getByRole('button', { name: /Begriff im ganzen Text nicht ersetzen/ }).click();
  await expect(page.locator('.cm-anonymat-hit')).toHaveCount(0);
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

  const popover = page.getByRole('dialog', {name:'Textauswahl pseudonymisieren'});
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

test('selecting a region with multiple matches offers individual bulk decisions',async({page})=>{
  const editor=page.locator('.cm-content');
  await editor.fill('Anna Müller schrieb an anna@example.org.');
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(2);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.up('Shift');

  const popover=page.getByRole('dialog',{name:'Textauswahl pseudonymisieren'});
  await expect(popover).toContainText('2 Fundstellen in Auswahl');
  await expect(popover.getByRole('checkbox')).toHaveCount(2);
  await expect(popover).toContainText('Anna Müller');
  await expect(popover).toContainText('anna@example.org');
  await popover.getByRole('checkbox',{name:/anna@example.org/}).uncheck();
  await popover.getByRole('button',{name:/Ausgewählte nicht ersetzen/}).click();
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(1);
  await expect(page.locator('.cm-anonymat-active')).toContainText(['anna@example.org']);
  await reveal(page);
  await expect(page.locator('.preview')).toContainText('Anna Müller');
});

test('bulk selection accepts reviewed findings independently of other marked text',async({page})=>{
  const editor=page.locator('.cm-content');
  await editor.fill('Frau Anna Müller sprach mit Ulrich am 12.08.2024.');
  await expect(page.locator('.cm-anonymat-hit').first()).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.up('Shift');
  const popover=page.getByRole('dialog',{name:'Textauswahl pseudonymisieren'});
  await expect(popover.locator('.selection-bulk-item').first()).toBeVisible();
  const count=await popover.getByRole('checkbox').count();
  expect(count).toBeGreaterThanOrEqual(2);
  await popover.getByRole('button',{name:/Ausgewählte pseudonymisieren/}).click();
  await expect(popover).not.toBeVisible();
  await expect(page.getByRole('button',{name:/Ergebnis prüfen/})).toBeEnabled();
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

  const popover = page.getByRole('dialog',{name:'Textauswahl pseudonymisieren'});
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
  await expect(faq).toContainText('Warum läuft Anonymat im Browser?');
  await expect(faq).toContainText('Warum heißt es Anonymat, obwohl nur pseudonymisiert wird?');
  await expect(faq).toContainText('Werden meine Texte oder Änderungen übertragen?');
  await expect(faq).toContainText('Du bist selbst dafür verantwortlich');
  await expect(faq.locator('section')).toHaveCount(6);
  await page.getByRole('button',{name:'Hilfe schließen'}).click();
  await expect(faq).not.toBeVisible();
});



test('abbreviated interval has two separately editable date highlights and roundtrips',async({page})=>{
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  const settings=page.locator('dialog.settings-dialog');
  await settings.locator('#date-shift-mode').selectOption('manual');
  await settings.locator('#date-offset').fill('30');
  await settings.getByRole('button',{name:'Schließen',exact:true}).click();

  await page.locator('.cm-content').fill('06.01.-10.01.2025');
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(2);
  await expect(page.locator('.cm-anonymat-active')).toHaveText(['06.01.','10.01.2025']);
  await reveal(page);
  await expect(page.locator('.preview')).toContainText('05.02.-09.02.2025');
  await expect(page.locator('.preview .shifted-date-mark')).toHaveCount(2);
  await page.getByRole('textbox',{name:'KI-Antwort mit Platzhaltern'}).fill('05.02.-09.02.2025');
  await expect(page.locator('.restore-preview')).toContainText('06.01.-10.01.2025');

  await page.locator('.cm-anonymat-active').first().click();
  await expect(page.getByRole('dialog',{name:'Markierung bearbeiten'})).toBeVisible();
  await page.locator('#hit-replacement-mode').selectOption('token');
  await reveal(page);
  await expect(page.locator('.preview .shifted-date-mark')).toHaveCount(1);
  await expect(page.locator('.preview .placeholder-token')).toHaveCount(1);
  await expect(page.locator('.preview')).toContainText('[DATE_001]-09.02.2025');
});

test('shifted dates and generated names are both marked as replacements',async({page})=>{
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await page.locator('#replacement-default').selectOption('synthetic');
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.locator('.cm-content').fill('Frau Müller kommt am 11.11.2026.');
  await reveal(page);
  await expect(page.locator('.preview .replacement-mark')).toHaveCount(2);
  await expect(page.locator('.preview .shifted-date-mark')).toHaveCount(1);
  await expect(page.locator('.preview .placeholder-token')).toHaveCount(0);

  await openReplacements(page);
  await page.getByRole('combobox',{name:'Ersetzungsmethode für Müller'}).selectOption('token');
  await closeReplacements(page);
  await reveal(page);
  await expect(page.locator('.preview .placeholder-token')).toHaveCount(1);
  await expect(page.locator('.preview .shifted-date-mark')).toHaveCount(1);
});

test('a clicked detection can choose a pseudonym without changing the global default',async({page})=>{
  await page.locator('.cm-content').fill('Frau Müller antwortete.');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(1);
  await page.locator('.cm-anonymat-auto').click();
  await page.locator('#hit-replacement-mode').selectOption('synthetic');
  await reveal(page);
  await expect(page.locator('.preview .replacement-mark')).toHaveCount(1);
  await expect(page.locator('.preview .placeholder-token')).toHaveCount(0);
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await expect(page.locator('#replacement-default')).toHaveValue('token');
});


test('manual text selection chooses a pseudonym before creating the mark',async({page})=>{
  const editor=page.locator('.cm-content');
  await editor.fill('Bitte CODEWORT');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for(let i=0;i<'CODEWORT'.length;i++)await page.keyboard.press('Shift+ArrowLeft');
  const popover=page.getByRole('dialog',{name:'Textauswahl pseudonymisieren'});
  await popover.getByRole('combobox',{name:'Ersetzung für Textauswahl'}).selectOption('synthetic');
  await popover.getByRole('button',{name:'Vorname',exact:true}).click();
  await expect(page.locator('.cm-anonymat-manual')).toHaveText('CODEWORT');
  await reveal(page);
  await expect(page.locator('.preview .replacement-mark')).toHaveCount(1);
  await expect(page.locator('.preview .placeholder-token')).toHaveCount(0);
});

test('copy stays visible while reviewing long output and confirms only successful clipboard writes', async ({page})=>{
  await page.setViewportSize({width:390,height:740});
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
      writeText:async(value:string)=>{localStorage.setItem('anonymat-test-clipboard',value);}
    }});
  });
  const source='kontakt: test@example.org\n'+('befund ohne weitere auffälligkeiten.\n'.repeat(90));
  await page.locator('.cm-content').fill(source);
  await reveal(page);
  const button=page.getByRole('button',{name:'Text kopieren',exact:true});
  await page.locator('.output-panel').evaluate(panel=>{
    window.scrollTo(0,panel.getBoundingClientRect().top+window.scrollY+panel.clientHeight/2);
  });
  await expect(button).toBeInViewport();
  const bounds=await button.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeLessThan(100);
  await button.click();
  await expect(page.getByText('Pseudonymisierter Text in die Zwischenablage kopiert.')).toBeVisible();
  await expect(button).toContainText('Kopiert!');
  expect(await page.evaluate(()=>localStorage.getItem('anonymat-test-clipboard'))).toBe(source.replace('test@example.org','[EMAIL_001]'));
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
      writeText:async()=>{throw new Error('blocked');}
    }});
  });
  await button.click();
  await expect(page.getByText('Automatisches Kopieren nicht verfügbar. Bitte Text manuell auswählen.')).toBeVisible();
  await expect(button).not.toContainText('Kopiert!');
});
