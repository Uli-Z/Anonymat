import { describe, expect, it } from 'vitest';
import { scanCities, hasCommonWordMeaning, commonCityCollisionCount } from '../src/lib/geography';
import { detectPII } from '../src/lib/detect';

describe('POS-derived ordinary-word versus place-name collisions',()=>{
  it('flags words attested in ordinary POS and not an exclusive whitelist of towns',()=>{
    expect(commonCityCollisionCount).toBeGreaterThan(0);
    expect(hasCommonWordMeaning('Essen')).toBe(true);
    expect(hasCommonWordMeaning('Waren')).toBe(true);
    expect(hasCommonWordMeaning('Halle')).toBe(true);
    expect(hasCommonWordMeaning('Berlin')).toBe(false);
  });
  it('requires geographic context for common-word town names',()=>{
    expect(scanCities('Das Essen schmeckte gut.')).toEqual([]);
    expect(scanCities('Die Waren wurden geliefert.')).toEqual([]);
    expect(scanCities('Die Halle ist groß.')).toEqual([]);
    expect(scanCities('Patient lebt in Essen.').map(h=>h.text)).toContain('Essen');
    expect(scanCities('Die Reise führte nach Waren.').map(h=>h.text)).toContain('Waren');
    expect(scanCities('Wohnort: Halle.').map(h=>h.text)).toContain('Halle');
  });
  it('allows cities with population evidence but not detected ordinary-word homonyms',()=>{
    expect(scanCities('Berlin ist groß.').map(h=>h.text)).toContain('Berlin');
    expect(scanCities('Paris und Bremen.').map(h=>h.text)).toEqual(['Paris','Bremen']);
    expect(detectPII('Die Waren wurden geliefert.')).toEqual([]);
  });
  it('does not infer that missing ordinary corpus evidence proves unique city status',()=>{
    expect(scanCities('Wismar wird untersucht.')).toEqual([]);
    expect(scanCities('Patient zog nach Wismar.').map(h=>h.text)).toEqual(['Wismar']);
  });
  it('preserves offsets on contextual and context-free matches',()=>{
    const source='🐈 In Essen, später Berlin.';
    const hits=scanCities(source);
    expect(hits.map(h=>h.text)).toEqual(['Essen','Berlin']);
    for(const hit of hits)expect(source.slice(hit.start,hit.end)).toBe(hit.text);
  });
});
