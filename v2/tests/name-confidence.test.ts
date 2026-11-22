import { describe, expect, it } from 'vitest';
import { detectPII } from '../src/lib/detect';
import { reviewDocument } from '../src/lib/session';
import { maskText } from '../src/lib/replace';
import { scanStreetLexicon } from '../src/lib/street-lexicon';
import { scanStructuredPII } from '../src/lib/structured-pii';
import type { Finding } from '../src/lib/detect-types';

describe('standalone name confidence',()=>{
  it('recognizes common given names with person context',()=>{
    const text='Peter berichtete darüber. Ulrich sagte später zu.';
    const hits=detectPII(text);
    expect(hits).toEqual(expect.arrayContaining([
      expect.objectContaining({kind:'FIRST_NAME',text:'Peter',confidence:'probable'}),
      expect.objectContaining({kind:'FIRST_NAME',text:'Ulrich',confidence:'probable'})
    ]));
    expect(reviewDocument(text,[],[],[]).active.map(hit=>hit.text)).toEqual(['Peter','Ulrich']);
  });
  it('offers isolated names for review but does not mask them silently',()=>{
    const source='Peter und Ulrich.';
    const reviewed=reviewDocument(source,[],[],[]);
    expect(reviewed.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({text:'Peter',confidence:'review'}),
      expect.objectContaining({text:'Ulrich',confidence:'review'})
    ]));
    expect(reviewed.active).toEqual([]);
    expect(reviewed.groups.every(group=>group.review && group.activeCount===0)).toBe(true);
    expect(maskText(source,reviewed.active).text).toBe(source);
  });
  it('a confirmed candidate becomes active document-wide',()=>{
    const source='Peter und Peter.';
    const pending=reviewDocument(source,[],[],[]);
    expect(pending.active).toHaveLength(0);
    const anchor:Finding={id:'confirmed',origin:'manual',kind:'FIRST_NAME',
      text:'Peter',start:0,end:5};
    const accepted=reviewDocument(source,[anchor],[],[]);
    expect(accepted.active.map(hit=>hit.text)).toEqual(['Peter','Peter']);
    expect(maskText(source,accepted.active).text).not.toContain('Peter');
  });
  it('keeps existing full-name and salutation detection',()=>{
    const hits=detectPII('Frau Anna Müller schrieb an Herrn Ulrich.');
    expect(hits.some(hit=>hit.text==='Anna Müller'&&hit.kind==='PERSON')).toBe(true);
    expect(hits.some(hit=>hit.text==='Ulrich'&&hit.kind==='PERSON')).toBe(true);
  });
  it('does not confuse an ordinary noun with a first name',()=>{
    const source='Die Rose blüht. Im Krankenhaus wurde die Behandlung fortgesetzt.';
    const hits=detectPII(source);
    expect(hits.some(hit=>['Rose','Krankenhaus','Behandlung'].includes(hit.text))).toBe(false);
  });
});

describe('hospital words versus streets',()=>{
  it('does not treat "im Krankenhaus" as an OSM street',()=>{
    expect(scanStreetLexicon('Er liegt im Krankenhaus.', ['Krankenhaus'])).toEqual([]);
    expect(scanStreetLexicon('Im Krankenhaus 5 wird behandelt.', ['Im Krankenhaus','Krankenhaus'])).toEqual([]);
  });
  it('does not invent an address from a numbered institution',()=>{
    const hits=scanStructuredPII('Im Krankenhaus 5 wird behandelt.');
    expect(hits.some(hit=>hit.kind==='ADDRESS')).toBe(false);
  });
  it('still recognizes real streets and explicit address records',()=>{
    expect(scanStreetLexicon('Er wohnt am Mohnblumenweg.', ['Mohnblumenweg'])
      .map(hit=>hit.text)).toEqual(['Mohnblumenweg']);
    expect(scanStreetLexicon('Anschrift: Lange Reihe 27', ['Lange Reihe'])
      .map(hit=>hit.text)).toEqual(['Lange Reihe 27']);
    expect(scanStreetLexicon('Adresse: Krankenhaus 5', ['Krankenhaus'])
      .map(hit=>hit.text)).toEqual(['Krankenhaus 5']);
    expect(detectPII('Am Wall 7.').some(hit=>hit.kind==='ADDRESS')).toBe(true);
  });
});
