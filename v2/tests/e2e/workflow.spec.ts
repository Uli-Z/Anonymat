import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = pathToFileURL(resolve('dist/index.html')).href;
test.use({locale:'de-DE',reducedMotion:'reduce'});

for(const viewport of [{width:1280,height:800},{width:390,height:740}]){
  test('explicit stage navigation and isolated text scrolling at '+viewport.width,async({page})=>{
    await page.setViewportSize(viewport);
    await page.addInitScript(()=>localStorage.setItem('anonymat-first-run-ack-v2','accepted'));
    await page.goto(html);
    const input=page.locator('.cm-content');
    const source='kontakt: test@example.org\n'+'befund ohne weitere auffälligkeiten.\n'.repeat(100);
    await input.fill(source);
    const next=page.getByRole('button',{name:'Ergebnis prüfen'});
    await expect(next).toBeEnabled();
    await expect(next).toBeInViewport();
    const scroller=page.locator('.cm-scroller');
    await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await scroller.hover();
    await page.mouse.wheel(0,1600);
    await expect(next).toBeInViewport();
    await expect(page.locator('[data-step="2"]')).toHaveAttribute('inert','');
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
    await next.click();
    const preview=page.locator('.preview');
    await expect(page.getByRole('button',{name:'Text kopieren'})).toBeInViewport();
    await preview.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    expect(await preview.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    await preview.hover();
    await page.mouse.wheel(0,1600);
    await expect(page.getByRole('button',{name:'Text kopieren'})).toBeInViewport();
    await expect(page.locator('[data-step="3"]')).toHaveAttribute('inert','');
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
    await page.getByRole('button',{name:'KI-Antwort einfügen'}).click();
    const reply=page.getByRole('textbox',{name:'KI-Antwort mit Platzhaltern'});
    await reply.fill('[EMAIL_001]\n'+'antwort.\n'.repeat(100));
    await expect(page.locator('.restore-preview')).toContainText('test@example.org');
    await expect(page.getByRole('button',{name:'Zurück zum Ergebnis'})).toBeInViewport();
    await page.getByRole('button',{name:'Zurück zum Ergebnis'}).click();
    await expect(page.getByRole('button',{name:'Text kopieren'})).toBeInViewport();
    await page.getByRole('button',{name:'Originaltext bearbeiten'}).click();
    await expect(next).toBeInViewport();
    await expect(input).toContainText('test@example.org');
    await page.getByRole('button',{name:'Neuer Text'}).click();
    await expect(next).toBeDisabled();
  });
}
