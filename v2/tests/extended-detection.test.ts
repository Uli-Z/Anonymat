import { describe, expect, it } from 'vitest';
import { detectPII, scanDocument } from '../src/lib/detect';
import { scanCities, bundledCityCount } from '../src/lib/geography';
import { maskText, restoreText } from '../src/lib/replace';

function has(text:string,kind:string,value:string):boolean{
  return detectPII(text).some(hit=>hit.kind===kind && hit.text===value);
}

describe('expanded automatic PII detection',()=>{
  it('detects inflected surnames, retaining the source span',()=>{
    const text='Der Brief des Herrn Müller liegt bei Müllers. Später antwortet Herr Müller.';
    const hits=detectPII(text).filter(hit=>hit.kind==='PERSON');
    expect(hits.map(hit=>hit.text)).toContain('Müller');
    expect(hits.map(hit=>hit.text)).toContain('Müllers');
    for(const hit of hits)expect(text.slice(hit.start,hit.end)).toBe(hit.text);
  });
  it('recognizes academic titles and inflected surnames',()=>{
    expect(has('An Herrn Dr. med. Müller: Bitte melden.','PERSON','Müller')).toBe(true);
    expect(has('Der Brief des Herrn Müllers.','PERSON','Müllers')).toBe(true);
    expect(has('Guten Tag Frau Anna Müller.','PERSON','Anna Müller')).toBe(true);
    expect(has('An Patient Max Mustermann.','PERSON','Max Mustermann')).toBe(true);
  });
  it('recognizes OA and OÄ physician titles with optional dots or missing spaces',()=>{
    const examples:[string,string][]=[
      ['OA Müller','Müller'],
      ['OÄ Anna Müller','Anna Müller'],
      ['OA. Dr. med. Schmidt','Schmidt'],
      ['OÄ. Dr. Anna Müller','Anna Müller'],
      ['OA.Müller','Müller'],
      ['OÄMüller','Müller']
    ];
    for(const [source,name] of examples)
      expect(has(source,'PERSON',name),source).toBe(true);
    const context='OA und OÄ besprechen den Fall.';
    expect(detectPII(context).some(hit=>hit.kind==='PERSON')).toBe(false);
  });
  it('preserves manual name subtypes across learned occurrences',()=>{
    const source='Frau Anna Müller; später Müllers Brief.';
    const anchor={id:'m',kind:'LAST_NAME' as const,origin:'manual' as const,text:'Müller',start:10,end:16};
    const hits=scanDocument(source,[anchor]);
    expect(hits.some(hit=>hit.kind==='LAST_NAME' && hit.text==='Müllers')).toBe(true);
  });
  it('does not mistake word-internal street suffixes for street names',()=>{
    for(const source of [
      'Die Bewegung war unauffällig.',
      'Fortbewegung und Bewegungsabläufe wurden untersucht.',
      'Die Wegbeschreibung enthält eine Bewegungsanalyse.',
      'Eine Bewegungseinschränkung liegt vor.',
      'Die Verwegung ist kein Straßenname.'
    ]){
      const falseStreets=detectPII(source).filter(hit=>hit.kind==='STREET'||hit.kind==='ADDRESS');
      expect(falseStreets,source).toEqual([]);
    }
    const source='Mohnblumenweg 12a und Berliner Straße 4.';
    const streets=detectPII(source).filter(hit=>hit.kind==='ADDRESS').map(hit=>hit.text);
    expect(streets).toEqual(['Mohnblumenweg 12a','Berliner Straße 4']);
  });
  it('recognizes streets, house numbers, postal codes and contextual cities',()=>{
    const input='Mohnblumenweg 12a, 28203 Bremen. Berliner Straße 4. Am Wall 7.';
    const hits=detectPII(input);
    expect(hits.some(hit=>hit.kind==='ADDRESS' && hit.text==='Mohnblumenweg 12a')).toBe(true);
    expect(hits.some(hit=>hit.kind==='ADDRESS' && hit.text==='Berliner Straße 4')).toBe(true);
    expect(hits.some(hit=>hit.kind==='ADDRESS' && hit.text==='Am Wall 7')).toBe(true);
    expect(hits.some(hit=>hit.kind==='POSTAL_CODE' && hit.text==='28203')).toBe(true);
    expect(hits.some(hit=>hit.kind==='CITY' && hit.text==='Bremen')).toBe(true);
  });
  it('recognizes street names without a house number',()=>{
    expect(has('Er wohnt am Mohnblumenweg.','STREET','Mohnblumenweg')).toBe(true);
    expect(has('An der Berliner Straße.','STREET','Berliner Straße')).toBe(true);
  });
  it('detects identifiers with explicit labels and avoids free-standing numeric noise',()=>{
    const text='Patienten-ID: AB-90323, Fallnummer 12345678, Kennzeichen HB AB 123, BIC: DEUTDEFF.';
    const kinds=detectPII(text).map(hit=>hit.kind);
    expect(kinds).toContain('ID');
    expect(kinds).toContain('LICENSE_PLATE');
    expect(kinds).toContain('BIC');
    expect(detectPII('Hb 8,2 g/dl, RR 110/65 mmHg, Kreatinin 1,30 mg/dl')).toEqual([]);
  });
  it('recognizes email, web URL, IPv4 and contextual clock times',()=>{
    const text='info@example.org, https://example.org/path?ref=5, IP 192.168.10.12, um 09:45 Uhr.';
    const kinds=detectPII(text).map(hit=>hit.kind);
    for(const expected of ['EMAIL','URL','IP','TIME'])expect(kinds).toContain(expected);
  });
  it('does not treat ambiguous city words as cities without location context',()=>{
    const hits=detectPII('Das Essen ist gut. In Waren findet eine Veranstaltung statt.');
    expect(hits.some(hit=>hit.text==='Essen')).toBe(false);
    expect(hits.some(hit=>hit.kind==='CITY' && hit.text==='Waren')).toBe(true);
  });
  it('allows disabling the city lexicon',()=>{
    const source='Berlin und ein Wohnort in Oslo.';
    expect(detectPII(source).some(hit=>hit.kind==='CITY')).toBe(true);
    expect(detectPII(source,'auto',false).some(hit=>hit.kind==='CITY')).toBe(false);
  });
  it('anonymizes and reversibly restores expanded kinds',()=>{
    const text='Schreiben an Herrn Müller, Mohnblumenweg 12, 28203 Bremen.';
    const found=detectPII(text);
    const masked=maskText(text,found);
    expect(masked.text).not.toContain('Müller');
    expect(masked.text).not.toContain('Mohnblumenweg');
    expect(restoreText(masked.text,masked.mapping).text).toBe(text);
  });
});

describe('offline European city lexicon',()=>{
  it('contains a seed and preserves Unicode UTF-16 offsets',()=>{
    expect(bundledCityCount).toBeGreaterThan(200);
    const text='🐱 Nach Zürich, dann nach Łódź und nach Paris.';
    const hits=scanCities(text);
    expect(hits.map(hit=>hit.text)).toContain('Zürich');
    expect(hits.map(hit=>hit.text)).toContain('Paris');
    for(const hit of hits)expect(text.slice(hit.start,hit.end)).toBe(hit.text);
  });
  it('scales with thousands of entries, without a regex per city',()=>{
    const names=Array.from({length:6000},(_,i)=>{
      let n=i;let s='';
      for(let j=0;j<4;j++){s=String.fromCharCode(97+n%26)+s;n=Math.floor(n/26);}
      return 'Ort'+s;
    });
    const source='Eintrag ohne Stadt. '.repeat(2500)+'Wohnort: '+names[410]+'.';
    const start=performance.now();
    const hits=scanCities(source,names);
    expect(hits.map(hit=>hit.text)).toEqual([names[410]]);
    expect(performance.now()-start).toBeLessThan(10000);
  });
});
