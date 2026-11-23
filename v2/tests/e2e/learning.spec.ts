import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html=pathToFileURL(resolve('dist/index.html')).href;

async function markLastWord(page:import('@playwright/test').Page,word:string):Promise<void>{
  const editor=page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for(let i=0;i<word.length;i++)await page.keyboard.press('Shift+ArrowLeft');
  await page.locator('.selection-popover').getByRole('button',{name:'Name',exact:true}).click();
}

test.beforeEach(async({page})=>{await page.goto(html);});

test('local consent, next-document suggestion and confirmation',async({page})=>{
  await page.locator('.cm-content').fill('Bitte Zorbel');
  await markLastWord(page,'Zorbel');
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  await expect(consent).toBeVisible();
  await consent.getByRole('button',{name:'Lokales Gedächtnis aktivieren'}).click();
  await expect(consent).not.toBeVisible();
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-review')).toHaveText('Zorbel');
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview')).toContainText('Zorbel antwortet.');
  await page.locator('.cm-anonymat-review').click();
  await page.getByRole('button',{name:/Als Namen bestätigen/}).click();
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview')).toContainText('[PERSON_001] antwortet.');
});

test('explicit automatic remembering persists after page reload and can be deleted',async({page})=>{
  await page.locator('.cm-content').fill('Bitte Zorbel');
  const editor=page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for(let i=0;i<6;i++)await page.keyboard.press('Shift+ArrowLeft');
  await page.locator('.selection-popover').getByRole('checkbox',{name:'Künftig automatisch anonymisieren'}).check();
  await page.locator('.selection-popover').getByRole('button',{name:'Name',exact:true}).click();
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  await consent.getByRole('button',{name:'Lokales Gedächtnis aktivieren'}).click();
  await expect(consent).not.toBeVisible();
  await page.reload();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-auto')).toHaveText('Zorbel');
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview')).toContainText('[PERSON_001]');
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await page.getByRole('button',{name:'Gelernten Begriff Zorbel löschen'}).click();
  await expect(page.getByRole('button',{name:'Gelernten Begriff Zorbel löschen'})).toHaveCount(0);
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-auto')).toHaveCount(0);
});

test('multiple old terms get one batch review dialog and can all be accepted',async({page})=>{
  await page.evaluate(async()=>{
    localStorage.setItem('anonymat-learning-consent-v1','on');
    const request=indexedDB.open('anonymat-learned-rules',1);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      request.onupgradeneeded=()=>request.result.createObjectStore('rules',{keyPath:'key'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('rules','readwrite');
      for(const term of ['Zorbel','Bexima','Crenala'])tx.objectStore('rules').put({
        key:term.toLocaleLowerCase('de'),term,kind:'PERSON',autoApply:false,updatedAt:Date.now()
      });
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.locator('.cm-content').fill('Zorbel, Bexima und Crenala.');
  const dialog=page.getByRole('dialog',{name:'Anonymisierungsvorschläge'});
  await expect(dialog).toBeVisible({timeout:10000});
  await expect(dialog).toContainText('3 aus früheren Texten');
  await dialog.getByRole('button',{name:'Alle übernehmen'}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.placeholder-token')).toHaveCount(3);
});
