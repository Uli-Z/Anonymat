import { describe, expect, it } from 'vitest';
import { scanNumbers } from '../src/lib/numbers';
import { detectPII } from '../src/lib/detect';
import { reviewDocument } from '../src/lib/session';
import { maskText, restoreText } from '../src/lib/replace';
import type { Finding } from '../src/lib/detect-types';

const scan=(source:string)=>detectPII(source,'auto',true,true);

describe('optional automatic numbers',()=>{
  it('finds plain values, decimals and grouped sums without replacing units',()=>{
    const source='12,48 Euro, 74 Kilo, 128 Zentimeter, 1.234,56 €, −3,5 % und 25';
    const numbers=scan(source).filter(hit=>hit.kind==='NUMBER');
    expect(numbers.map(hit=>hit.text)).toEqual(['12,48','74','128','1.234,56','−3,5','25']);
    for(const hit of numbers)expect(source.slice(hit.start,hit.end)).toBe(hit.text);
    expect(maskText(source,numbers).text).toContain('[NUMBER_001] Euro');
    expect(maskText(source,numbers).text).toContain('[NUMBER_002] Kilo');
  });


  it('recognizes attached units and currency without including them in the number',()=>{
    const source='74kg, 128cm, 12,48EUR, 0,5mg, 150mmol/L, 120mL, 18µg, 25°C, 40%, 20m², 30mg/dL, 12,5Euro';
    const values=['74','128','12,48','0,5','150','120','18','25','40','20','30','12,5'];
    for(const hits of [scanNumbers(source),scan(source).filter(hit=>hit.kind==='NUMBER')]){
      expect(hits.map(hit=>hit.text)).toEqual(values);
      for(const hit of hits)expect(source.slice(hit.start,hit.end)).toBe(hit.text);
    }
  });

  it('does not mask identifier fragments, unknown suffixes or single digits with attached units',()=>{
    const source='AB123kg AB-123kg 123ABC 12,48abc 128cmX 12kg2 15_kg A12,48kg 7kg 1h';
    expect(scanNumbers(source)).toEqual([]);
    expect(scanNumbers('12. Punkt\n  23) Zweitens\n- 34. Drittens\nLänge 128cm.').map(hit=>hit.text)).toEqual(['128']);
  });

  it('preserves attached units through masking and restoration',()=>{
    const source='Gewicht: 74kg, Länge: 128cm, Betrag: 12,48EUR.';
    const reviewed=reviewDocument(source,[],[],[],'auto',true,[],{NUMBER:true});
    const masked=maskText(source,reviewed.active);
    expect(masked.text).toBe('Gewicht: [NUMBER_001]kg, Länge: [NUMBER_002]cm, Betrag: [NUMBER_003]EUR.');
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
    expect(reviewDocument(source,[],[],[],'auto',true,[],{NUMBER:false}).active.filter(hit=>hit.kind==='NUMBER')).toEqual([]);
  });

  it('leaves isolated digits 0–9 unchanged but detects larger and decimal values',()=>{
    const source='1 2 3 4 5 6 7 8 9 0, 1 kg, +2, −3, 10 kg, 1,5 kg, 0,5 €';
    expect(scanNumbers(source).map(hit=>hit.text)).toEqual(['10','1,5','0,5']);
    expect(scan(source).filter(hit=>hit.kind==='NUMBER').map(hit=>hit.text))
      .toEqual(['10','1,5','0,5']);
  });
  it('leaves numbered and indented enumerations alone',()=>{
    const source='1. Erstens\n  2) Zweitens\n- 3. Drittens\n4.) Viertens\nDie Länge beträgt 128 cm.';
    expect(scanNumbers(source).map(hit=>hit.text)).toEqual(['128']);
    expect(scan(source).filter(hit=>hit.kind==='NUMBER').map(hit=>hit.text)).toEqual(['128']);
  });

  it('preserves dates, times, IBANs, identifiers, addresses and IPs',()=>{
    const source='Am 11.11.2026 um 09:45 Uhr: IBAN DE89370400440532013000, '+
      'Fallnummer 12345678, Mohnblumenweg 12, IP 192.168.10.12, 74 kg.';
    const found=scan(source);
    for(const kind of ['DATE','TIME','IBAN','ID','ADDRESS','IP','NUMBER'])
      expect(found.some(hit=>hit.kind===kind),kind).toBe(true);
    expect(found.filter(hit=>hit.kind==='NUMBER').map(hit=>hit.text)).toEqual(['74']);
  });

  it('allows category switches but retains explicit manual marks',()=>{
    const source='12,48 Euro an IBAN DE89370400440532013000.';
    const enabled=reviewDocument(source,[],[],[],'auto',true,[],{NUMBER:true,IBAN:false});
    expect(enabled.active.map(hit=>hit.kind)).toEqual(['NUMBER']);
    expect(enabled.active[0].text).toBe('12,48');
    const disabled=reviewDocument(source,[],[],[],'auto',true,[],{NUMBER:false,IBAN:true});
    expect(disabled.active.map(hit=>hit.kind)).toEqual(['IBAN']);
    const manualStart=source.indexOf('12,48');
    const manual:Finding={id:'explicit-number',origin:'manual',kind:'NUMBER',
      text:'12,48',start:manualStart,end:manualStart+5};
    const accepted=reviewDocument(source,[manual],[],[],'auto',true,[],{NUMBER:false});
    expect(accepted.active.some(hit=>hit.id==='explicit-number')).toBe(true);
  });

  it('hides learned automatic matches in a disabled category',()=>{
    const source='74 Euro';
    const learned=[{key:'number-74',term:'74',kind:'NUMBER' as const,updatedAt:1}];
    const off=reviewDocument(source,[],[],[],'auto',true,learned,{NUMBER:false});
    expect(off.findings).toEqual([]);
  });

  it('roundtrips automatically masked numerical values and output offsets',()=>{
    const source='Betrag 12,48 Euro, Gewicht 74 kg, Größe 128 cm.';
    const reviewed=reviewDocument(source,[],[],[],'auto',true,[],{NUMBER:true});
    const masked=maskText(source,reviewed.active);
    expect(masked.text).toBe('Betrag [NUMBER_001] Euro, Gewicht [NUMBER_002] kg, Größe [NUMBER_003] cm.');
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
    expect(masked.replacementSpans).toHaveLength(3);
  });
});
