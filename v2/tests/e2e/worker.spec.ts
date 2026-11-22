import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html=pathToFileURL(resolve('dist/index.html')).href;

test('analysis can be aborted and restarted without releasing stale output',async({page})=>{
  test.setTimeout(45000);
  await page.goto(html);
  const text=('Frau Anna Müller wohnt in Bremen, Mohnblumenweg 12. '+
    'Die Waren wurden geliefert, Hb 8,1 g/dl.\n').repeat(120);
  await page.locator('.cm-content').fill(text);
  // Cancel during the 150 ms debounce before a scan starts: deterministic
  // across slow and fast CI browsers, without a huge CodeMirror paste.
  await page.getByRole('button',{name:'Abbrechen'}).click({timeout:10000});
  await expect(page.getByText(/Analyse abgebrochen/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeDisabled();
  await page.getByRole('button',{name:'Erneut analysieren'}).click();
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeEnabled({timeout:25000});
  await expect(page.locator('.placeholder-token').first()).toBeVisible();
  // Technical scan details now live behind Settings, not above the editor.
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await page.getByText('Lexika und Quellen').click();
  await expect(page.getByText(/Letzter vollständiger Scan/)).toBeVisible();
});

test('quick edits never expose an earlier pseudonymization preview',async({page})=>{
  await page.goto(html);
  const input=page.locator('.cm-content');
  await input.fill('Frau Anna Müller wohnt in Bremen.');
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeEnabled();
  await input.fill('Frau Carla Becker wohnt in Berlin.');
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeEnabled();
  await expect(page.locator('.preview')).not.toContainText('Müller');
  await expect(page.locator('.preview')).not.toContainText('Bremen');
});
