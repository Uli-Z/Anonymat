import { describe, expect, it } from 'vitest';
import { findTerms } from '../src/lib/term-index';
import { scanDocument, type Finding } from '../src/lib/detect';

describe('linear multi-term matcher',()=>{
  it('preserves unicode offsets and avoids word fragments',()=>{
    const text='🐱 Frau Müller — Müllerhaus — MÜLLER.';
    const matches=findTerms(text,['Müller']);
    expect(matches.map(x=>x.text)).toEqual(['Müller','MÜLLER']);
    for(const x of matches)expect(text.slice(x.start,x.end)).toBe(x.text);
  });
  it('never interprets user-selected regex characters as patterns',()=>{
    const text='[PATIENT] (H.) C:\\Users [PATIENT]';
    const matches=findTerms(text,['[PATIENT]','(H.)','C:\\Users']);
    expect(matches.map(x=>x.text)).toEqual(['[PATIENT]','(H.)','C:\\Users','[PATIENT]']);
  });
  it('handles a length-expanding Unicode case fold with exact source offsets',()=>{
    const text='İpek und i\u0307pek';
    const matches=findTerms(text,['İpek']);
    expect(matches.length).toBe(2);
    for(const m of matches)expect(text.slice(m.start,m.end)).toBe(m.text);
  });
  it('scales to many learned terms without a regex per term',()=>{
    const words=Array.from({length:800},(_,i)=>'Pseudonym'+i.toString().padStart(4,'0'));
    const text='Eintrag '.repeat(2500)+' '+words[410]+' Ende.';
    const start=performance.now();
    const result=findTerms(text,words);
    const elapsed=performance.now()-start;
    expect(result.map(m=>m.text)).toEqual([words[410]]);
    expect(elapsed).toBeLessThan(8000);
  });
  it('preserves explicitly classified overrides after other edits',()=>{
    const source='Frau Anna Müller und später Müller.';
    const first=source.indexOf('Anna');
    const last=source.indexOf('Müller');
    const marks:Finding[]=[
      {id:'first',kind:'FIRST_NAME',origin:'manual',text:'Anna',start:first,end:first+4},
      {id:'last',kind:'LAST_NAME',origin:'manual',text:'Müller',start:last,end:last+6}
    ];
    expect(scanDocument(source,marks).map(h=>h.kind)).toEqual(['FIRST_NAME','LAST_NAME','LAST_NAME']);
  });
});
