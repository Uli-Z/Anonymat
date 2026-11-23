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
