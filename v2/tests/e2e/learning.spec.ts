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

test('local consent makes every learned term active in the next document',async({page})=>{
  await page.locator('.cm-content').fill('Bitte Zorbel');
  await markLastWord(page,'Zorbel');
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  await expect(consent).toBeVisible();
  await consent.getByRole('button',{name:'Lokales Gedächtnis aktivieren'}).click();
  await expect(consent).not.toBeVisible();
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-active')).toHaveText('Zorbel');
  await expect(page.locator('.cm-anonymat-review')).toHaveCount(0);
  await expect(page.locator('.cm-anonymat-active')).toHaveAttribute('title',/Wird pseudonymisiert.*lokalen Gedächtnis/);
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview')).toContainText('[PERSON_001] antwortet.');
});

test('stored rules survive reload and can be deleted without an auto-apply checkbox',async({page})=>{
  await page.locator('.cm-content').fill('Bitte Zorbel');
  await markLastWord(page,'Zorbel');
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  await consent.getByRole('button',{name:'Lokales Gedächtnis aktivieren'}).click();
  await expect(consent).not.toBeVisible();
  await page.reload();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-active')).toHaveText('Zorbel');
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await expect(page.locator('.learned-row input[type="checkbox"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Gelernten Begriff Zorbel löschen'}).click();
  await expect(page.getByRole('button',{name:'Gelernten Begriff Zorbel löschen'})).toHaveCount(0);
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(0);
});

test('old stored suggestions become active rules without repeated confirmation',async({page})=>{
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
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(3);
  await expect(page.getByRole('dialog',{name:'Vorschläge zur Pseudonymisierung'})).not.toBeVisible();
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.placeholder-token')).toHaveCount(3);
});

test('three unconfirmed pattern names cause one batch review with accept-all',async({page})=>{
  await page.locator('.cm-content').fill('Peter, Ulrich und Sabine.');
  const dialog=page.getByRole('dialog',{name:'Vorschläge zur Pseudonymisierung'});
  await expect(dialog).toBeVisible({timeout:10000});
  await expect(dialog).toContainText('3 mögliche personenbezogene Begriffe');
  await dialog.getByRole('button',{name:'Alle übernehmen'}).click();
  await expect(dialog).not.toBeVisible();
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  if(await consent.isVisible())await consent.getByRole('button',{name:'Nur diesen Text'}).click();
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.placeholder-token')).toHaveCount(3);
});

test('open suggestions remain visible in output and trigger a one-time copy warning',async({page})=>{
  await page.locator('.cm-content').fill('Peter und Ulrich.');
  await expect(page.locator('.cm-anonymat-review')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Vorschläge prüfen (2)'})).toBeVisible();
  await expect(page.locator('.cm-anonymat-review').first()).toHaveAttribute('title',/Vorschlag – noch nicht pseudonymisiert/);
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(0);
  await page.getByRole('button',{name:/Ergebnis prüfen/}).click();
  await expect(page.locator('.preview-suggestion')).toHaveCount(2);
  await expect(page.locator('.proposal-review-banner')).toContainText('2 Vorschläge sind noch ungeprüft');
  await page.getByRole('button',{name:'Text kopieren'}).click();
  const warning=page.getByRole('dialog',{name:'Ungeprüfte Vorschläge im Text'});
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Trotzdem kopieren');
  await warning.getByRole('button',{name:'Trotzdem kopieren'}).click();
  await expect(warning).not.toBeVisible();
  await page.getByRole('button',{name:'Text kopieren'}).click();
  await expect(warning).not.toBeVisible();
});

test('touching an orange mark opens a bottom sheet with both decisions',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.goto(html);
  await page.locator('.cm-content').fill('Peter.');
  await expect(page.locator('.cm-anonymat-review')).toHaveCount(1);
  await page.locator('.cm-anonymat-review').tap();
  const sheet=page.getByRole('dialog',{name:'Markierung bearbeiten'});
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button',{name:'Vorschlag übernehmen'})).toBeVisible();
  await expect(sheet.getByRole('button',{name:'Vorschlag verwerfen'})).toBeVisible();
  const bounds=await sheet.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y+bounds!.height).toBeGreaterThan(820);
  await sheet.getByRole('button',{name:'Vorschlag verwerfen'}).tap();
  await expect(page.locator('.cm-anonymat-review')).toHaveCount(0);
  await context.close();
});


test('a learned hit offers permanent deletion while its current-text exclusion remains separate',async({page})=>{
  await page.locator('.cm-content').fill('Bitte Zorbel');
  await markLastWord(page,'Zorbel');
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  await consent.getByRole('button',{name:'Lokales Gedächtnis aktivieren'}).click();
  await expect(consent).not.toBeVisible();

  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  const mark=page.locator('.cm-anonymat-active');
  await expect(mark).toHaveText('Zorbel');
  await mark.click();
  const popup=page.getByRole('dialog',{name:'Markierung bearbeiten'});
  await expect(popup.getByRole('button',{name:'Aus Gedächtnis löschen'})).toBeVisible();
  await popup.getByRole('button',{name:'Begriff im ganzen Text nicht ersetzen'}).click();
  await expect(mark).toHaveCount(0);

  await page.getByRole('button',{name:/Ersetzungen anzeigen/}).click();
  const row=page.locator('.finding-row').filter({hasText:'Zorbel'});
  const deleteRule=row.getByRole('button',{name:'Aus lokalem Gedächtnis löschen: Zorbel'});
  await expect(deleteRule).toBeVisible();
  await deleteRule.click();
  await expect(deleteRule).toHaveCount(0);

  await page.getByRole('button',{name:'Ersetzungen schließen'}).click();
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await expect(page.getByRole('button',{name:'Gelernten Begriff Zorbel löschen'})).toHaveCount(0);
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(0);
  await page.reload();
  await page.locator('.cm-content').fill('Zorbel antwortet.');
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(0);
});

test('permanent deletion directly from a green learned mark survives reload',async({page})=>{
  await page.locator('.cm-content').fill('Bitte Zorbel');
  await markLastWord(page,'Zorbel');
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  await consent.getByRole('button',{name:'Lokales Gedächtnis aktivieren'}).click();
  await expect(consent).not.toBeVisible();
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Zorbel meldete sich.');
  const mark=page.locator('.cm-anonymat-active');
  await expect(mark).toHaveText('Zorbel');
  await mark.click();
  const popup=page.getByRole('dialog',{name:'Markierung bearbeiten'});
  await popup.getByRole('button',{name:'Aus Gedächtnis löschen'}).click();
  await expect(mark).toHaveCount(0);
  await page.reload();
  await page.locator('.cm-content').fill('Zorbel meldete sich.');
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(0);
});

test('deleting a derived surname from its menu removes the original stored full-name rule',async({page})=>{
  await page.locator('.cm-content').fill('Bitte Ulrich Xytronix');
  await markLastWord(page,'Ulrich Xytronix');
  const consent=page.getByRole('dialog',{name:'Ersetzungen dauerhaft merken?'});
  await consent.getByRole('button',{name:'Lokales Gedächtnis aktivieren'}).click();
  await expect(consent).not.toBeVisible();

  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Xytronix meldete sich.');
  await expect(page.locator('.cm-anonymat-active')).toHaveText('Xytronix');
  await page.locator('.cm-anonymat-active').click();
  await page.getByRole('dialog',{name:'Markierung bearbeiten'})
    .getByRole('button',{name:'Aus Gedächtnis löschen'}).click();
  await page.getByRole('button',{name:'Einstellungen öffnen'}).click();
  await expect(page.getByRole('button',{name:'Gelernten Begriff Ulrich Xytronix löschen'})).toHaveCount(0);
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:/Neuer Text/}).click();
  await page.locator('.cm-content').fill('Xytronix meldete sich.');
  await expect(page.locator('.cm-anonymat-active')).toHaveCount(0);
});
