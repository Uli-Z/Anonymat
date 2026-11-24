import { describe, expect, it, vi } from 'vitest';
import { syntheticReplacement } from '../src/lib/synthetic';
import { maskText, restoreText } from '../src/lib/replace';
import type { Finding } from '../src/lib/detect';

// The production dictionaries contain multiple scripts, unlike the small
// checked-in seeds. Use explicit mixed-script fixtures so CI covers both.
vi.mock('../src/data/given-names.json',()=>({default:[
  'Anna','Élodie','Peter','Łukasz','Иван','Анна','Ольга','Юрий','Aнна','Αλέξανδρος'
]}));
vi.mock('../src/data/family-names.json',()=>({default:[
  'Müller','Özdemir','Kowalski','O’Connor','Иванов','Петров','Смирнов','Кузнецов','Pетров'
]}));

const latin=/^\p{Script=Latin}+$/u;
const cyrillic=/^\p{Script=Cyrillic}+$/u;
const letters=(value:string)=>value.normalize('NFC').replace(/[^\p{L}]/gu,'');

describe('script-preserving synthetic names',()=>{
  it('keeps given and family names in their original script over many seeds',()=>{
    for(let seed=0;seed<128;seed++){
      for(const [kind,original,script] of [
        ['FIRST_NAME','Anna',latin],
        ['FIRST_NAME','E\u0301lodie',latin],
        ['FIRST_NAME','Иван',cyrillic],
        ['FIRST_NAME','ОЛЬГА',cyrillic],
        ['LAST_NAME','Müller',latin],
        ['LAST_NAME','O’Connor',latin],
        ['LAST_NAME','Иванов',cyrillic],
        ['LAST_NAME','петров',cyrillic],
      ] as const){
        const alias=syntheticReplacement(kind,original,seed,original,new Map());
        expect(alias).not.toBeNull();
        expect(letters(alias!)).toMatch(script);
        expect(alias!.normalize('NFC').toLowerCase()).not.toBe(original.normalize('NFC').toLowerCase());
        if(original==='ОЛЬГА')expect(alias).toBe(alias!.toUpperCase());
        if(original==='петров')expect(alias).toBe(alias!.toLowerCase());
      }
    }
  });

  it('preserves script and component consistency for full names',()=>{
    for(const [full,first,last,script] of [
      ['Anna Müller','Anna','Müller',latin],
      ['Иван Иванов','Иван','Иванов',cyrillic],
      ['Anna Иванов','Anna','Иванов',null],
    ] as const){
      const source=full+' / '+first+' / '+last;
      const assignments=new Map<string,string>();
      const alias=syntheticReplacement('PERSON',full,42,source,assignments);
      expect(alias).not.toBeNull();
      const given=syntheticReplacement('FIRST_NAME',first,42,source,assignments);
      const family=syntheticReplacement('LAST_NAME',last,42,source,assignments);
      expect(alias).toBe(given+' '+family);
      expect(letters(given!)).toMatch(script??latin);
      expect(letters(family!)).toMatch(script??cyrillic);
    }
  });

  it('never falls back to the wrong script when the matching pool is exhausted',()=>{
    const source='Иван Анна Ольга Юрий';
    const finding:Finding={id:'1',origin:'manual',kind:'FIRST_NAME',start:0,end:4,text:'Иван'};
    const result=maskText(source,[finding],{},{
      defaultReplacementMode:'synthetic',syntheticSeed:7
    });
    expect(result.mapping[0].token).toBe('[FIRST_NAME_001]');
    expect(result.warnings).toHaveLength(1);
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });

  it('does not guess a script for a mixed-script word or unsupported script',()=>{
    expect(syntheticReplacement('FIRST_NAME','Aнна',1,'Aнна',new Map())).toBeNull();
    expect(syntheticReplacement('FIRST_NAME','Αλέξανδρος',1,'Αλέξανδρος',new Map())).toBeNull();
  });

  it('round-trips a document with Latin and Cyrillic names',()=>{
    const source='Anna Müller / Иван Иванов';
    const findings:Finding[]=[
      {id:'1',origin:'manual',kind:'PERSON',start:0,end:11,text:'Anna Müller'},
      {id:'2',origin:'manual',kind:'PERSON',start:14,end:25,text:'Иван Иванов'}
    ];
    const result=maskText(source,findings,{},{
      defaultReplacementMode:'synthetic',syntheticSeed:123
    });
    expect(result.mapping).toHaveLength(2);
    expect(letters(result.mapping[0].token)).toMatch(latin);
    expect(letters(result.mapping[1].token)).toMatch(cyrillic);
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });
});
