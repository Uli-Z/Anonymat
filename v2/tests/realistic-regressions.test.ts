import { describe, expect, it } from 'vitest';
import { detectPII } from '../src/lib/detect';
import { reviewDocument } from '../src/lib/session';
import { maskText, restoreText } from '../src/lib/replace';
import { scanStreetLexicon } from '../src/lib/street-lexicon';

function kinds(text: string) {
  return detectPII(text).map(h => ({ text: h.text, kind: h.kind }));
}
describe('regressions from the realistic scenario audit', () => {
  it('finds complete dates when the next word has no separating space', () => {
    for (const text of [
      'am 10.03.2026wurde untersucht',
      'am 12.03.2026geplant',
      '21.11.2026Patient wurde übernommen',
      '22.11.2026Entlassung'
    ]) {
      const sourceDate = /\d{1,2}\.\d{1,2}\.\d{4}/.exec(text)![0];
      const hits = kinds(text);
      expect(hits, text).toContainEqual({text:sourceDate,kind:'DATE'});
      expect(hits.some(h => h.kind === 'DATE' && h.text !== sourceDate), text).toBe(false);
    }
  });
  it('accepts a missing space before a date after common date cues', () => {
    expect(kinds('Geb.am10.03.1980.')).toContainEqual({ text:'10.03.1980', kind:'DATE' });
  });
  it('does not split an invalid full date into a day/month fragment', () => {
    expect(kinds('31.02.2026')).toEqual([]);
  });
  it('does not misclassify calendar periods as postal addresses', () => {
    const hits = kinds('Im April 2026 und im Jahr 2027.');
    expect(hits).not.toContainEqual({text:'Im April 2026',kind:'ADDRESS'});
    expect(hits).not.toContainEqual({text:'im Jahr 2027',kind:'ADDRESS'});
    expect(hits).toContainEqual({text:'April 2026',kind:'DATE'});
    expect(hits).toContainEqual({text:'2027',kind:'DATE'});
  });
  it('does not turn a room number into an OSM road even when that road exists', () => {
    expect(scanStreetLexicon('Im Raum 11 steht das Material.', ['Im Raum'])).toEqual([]);
    expect(scanStreetLexicon('Anschrift: Im Raum 11', ['Im Raum']).map(h=>h.text))
      .toEqual(['Im Raum 11']);
  });
  it('does not confuse IBAN labels with person names in finance context', () => {
    const hits=kinds('Bitte überweisen an IBAN DE89 3704 0044 0532 0130 00.');
    expect(hits.some(hit=>hit.kind==='PERSON'&&hit.text==='IBAN')).toBe(false);
  });
  it('does not mark generic nouns such as Parkplatz', () => {
    expect(kinds('Der Parkplatz ist leer. Im Krankenhaus wird behandelt.')).toEqual([]);
    expect(kinds('Anschrift: Am Wall 7')).toContainEqual({text:'Am Wall 7',kind:'ADDRESS'});
  });
  it('excludes sentence punctuation from identifier spans', () => {
    const hits=kinds('Fallnummer 12345678. Patienten-ID: AB-90323, Rechnungsnummer RE-20334.');
    for(const value of ['12345678','AB-90323','RE-20334'])
      expect(hits).toContainEqual({text:value,kind:'ID'});
    expect(hits.some(hit => hit.kind==='ID' && /[.,;:]$/.test(hit.text))).toBe(false);
  });
  it('recognizes postal codes glued to a city name', () => {
    const hits=kinds('Mohnblumenweg 12a,28203Bremen.');
    expect(hits).toContainEqual({text:'Mohnblumenweg 12a',kind:'ADDRESS'});
    expect(hits).toContainEqual({text:'28203',kind:'POSTAL_CODE'});
    expect(hits).toContainEqual({text:'Bremen',kind:'CITY'});
  });
  it('handles joined salutations and a simple given-name typo with strong context', () => {
    const hits=kinds('HerrnMüller rief FrauSchmidt an. Annna Müller meldete sich.');
    expect(hits).toContainEqual({text:'Müller',kind:'PERSON'});
    expect(hits).toContainEqual({text:'Schmidt',kind:'PERSON'});
    expect(hits).toContainEqual({text:'Annna Müller',kind:'PERSON'});
  });
  it('does not include a title inside an explicitly labelled name', () => {
    const hits=kinds('Ansprechpartner: Herr Becker.');
    expect(hits).toContainEqual({text:'Becker',kind:'PERSON'});
    expect(hits.some(h=>h.kind==='PERSON' && h.text==='Herr Becker')).toBe(false);
  });
  it('does not mask isolated ambiguous names without review', () => {
    const input='Peter und Ulrich.';
    const reviewed=reviewDocument(input,[],[],[]);
    expect(reviewed.active).toEqual([]);
    expect(maskText(input,reviewed.active).text).toBe(input);
  });
  it('roundtrips a realistic typo-heavy sentence after masking', () => {
    const source='HerrnMüller: am10.03.2026wurde die Nachricht an info@example.org gesendet.';
    const reviewed=reviewDocument(source,[],[],[]);
    const masked=maskText(source,reviewed.active);
    expect(masked.text).not.toContain('Müller');
    expect(masked.text).not.toContain('10.03.2026');
    expect(masked.text).not.toContain('info@example.org');
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
  });
});
