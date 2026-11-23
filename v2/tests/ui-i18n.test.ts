import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LANGUAGE_STORAGE_KEY, preferredBrowserLanguage, resolveLanguage,
  loadLanguagePreference, saveLanguagePreference, translate, translateDiagnostic
} from '../src/lib/ui-i18n';

afterEach(() => { vi.unstubAllGlobals(); });

describe('user interface language', () => {
  it('uses the first supported language in browser priority order', () => {
    expect(preferredBrowserLanguage(['de-DE','en-US'])).toBe('de');
    expect(preferredBrowserLanguage(['en-GB','de-DE'])).toBe('en');
    expect(preferredBrowserLanguage(['fr-FR','de-AT','en-US'])).toBe('de');
    expect(preferredBrowserLanguage(['en_US','de_DE'])).toBe('en');
    expect(preferredBrowserLanguage(['es-ES','fr-FR'])).toBe('en');
    expect(preferredBrowserLanguage([])).toBe('en');
  });

  it('overrides auto-detection only when the user chooses a language', () => {
    expect(resolveLanguage('auto',['de-DE'])).toBe('de');
    expect(resolveLanguage('en',['de-DE'])).toBe('en');
    expect(resolveLanguage('de',['en-US'])).toBe('de');
    expect(resolveLanguage('auto',['en-US'])).toBe('en');
  });

  it('persists explicit overrides and clears them when returning to automatic', () => {
    const items = new Map<string,string>();
    vi.stubGlobal('localStorage', {
      getItem: (key:string) => items.get(key) ?? null,
      setItem: (key:string,value:string) => {items.set(key,value);},
      removeItem: (key:string) => {items.delete(key);}
    });
    expect(loadLanguagePreference()).toBe('auto');
    saveLanguagePreference('de');
    expect(items.get(LANGUAGE_STORAGE_KEY)).toBe('de');
    expect(loadLanguagePreference()).toBe('de');
    saveLanguagePreference('en');
    expect(loadLanguagePreference()).toBe('en');
    saveLanguagePreference('auto');
    expect(loadLanguagePreference()).toBe('auto');
    expect(items.has(LANGUAGE_STORAGE_KEY)).toBe(false);
  });

  it('still detects browser language if local storage is unavailable', () => {
    vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('private mode');},setItem:()=>{throw new Error('private mode');},removeItem:()=>{throw new Error('private mode');}});
    expect(loadLanguagePreference()).toBe('auto');
    expect(()=>saveLanguagePreference('de')).not.toThrow();
    expect(resolveLanguage(loadLanguagePreference(),['de-DE'])).toBe('de');
  });

  it('translates interface text but never changes source or replacement tokens', () => {
    expect(translate('de','Texte pseudonymisieren')).toBe('Texte pseudonymisieren');
    expect(translate('en','Texte pseudonymisieren')).toBe('Pseudonymize text');
    expect(translate('en','Einstellungen')).toBe('Settings');
    expect(translate('en','Vorname')).toBe('Given name');
    const source='Frau Anna Müller, Datum 12.03.2026: [PERSON_001]';
    expect(translate('en',source)).toBe(source);
  });

  it('translates key scanner and date warnings at display time', () => {
    expect(translateDiagnostic('en','Unvollständiges Datum "10. März" mit Wochentag wird nicht verschoben; bitte als Token prüfen.'))
      .toContain('Incomplete date "10. März"');
    expect(translateDiagnostic('de','Datum "12.03.2026" konnte nicht sicher verschoben werden; stattdessen als Token ersetzt.'))
      .toContain('Datum "12.03.2026"');
  });
});
