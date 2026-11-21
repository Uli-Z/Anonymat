import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html=pathToFileURL(resolve('dist/index.html')).href;

test('analysis can be aborted and restarted without releasing stale output',async({page})=>{
  await page.goto(html);
  const text=('Frau Anna Müller wohnt in Bremen, Mohnblumenweg 12. '+
    'Die Waren wurden geliefert, Hb 8,1 g/dl.\n').repeat(4000);
  await page.locator('.cm-content').fill(text);
  await expect(page.getByRole('button',{name:'Abbrechen'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeDisabled();
  await page.getByRole('button',{name:'Abbrechen'}).click();
  await expect(page.getByText(/Analyse abgebrochen/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeDisabled();
  await page.getByRole('button',{name:'Erneut analysieren'}).click();
  await expect(page.getByRole('button',{name:'Text kopieren'})).toBeEnabled({timeout:25000});
  await expect(page.locator('.placeholder-token').first()).toBeVisible();
  await expect(page.getByText(/Letzter vollständiger Scan/)).toBeVisible();
},45000);

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
},30000);
