import { describe, expect, it } from 'vitest';
import { detectPII } from '../src/lib/detect';
import { scanPersonNames } from '../src/lib/person-names';
import { maskText, restoreText } from '../src/lib/replace';

const cases: Array<[string,string[]]> = [
  ['Herrn  Anna\tMüller',['Anna\tMüller']],
  ['OÄ: Žofie Nováková',['Žofie Nováková']],
  ['Prof. Dr. med. Anna Müller',['Anna Müller']],
  ['Fr.Łukasz',['Łukasz']],
  ['Herr von der Leyen',['von der Leyen']],
  ['Heute Anna Müller',['Anna Müller']],
  ['Patientin: Julia Meyer',['Julia Meyer']],
  ['Frau Müller. Der Müller mahlt das Getreide.',['Müller']],
  ['Frau Klein. Das ist klein.',['Klein']],
  ['Patient Klinik. Familie Therapie. OA Rücksprache.',[]],
  ['Guten Morgen. Vielen Dank. Der Koch ist da.',[]],
  ['Name: Anna   Müller',['Anna   Müller']],
  ['HerrnMüller',['Müller']],
  ['Frau Anna Müller berichtete vom Gespräch mit Müllers Anwalt.',['Anna Müller','Müllers']],
  ['Frau Lea-Marie Becker stellte sich vor.',['Lea-Marie Becker']],
  ['Patientin Łucja Żuk.',['Łucja Żuk']],
  ['Name: Annna Müller. Vorname: Annna, Nachname: Müller.',['Annna Müller','Annna','Müller']],
  ['Herrn Qazmirek',['Qazmirek']],
  ['OA\tSchmidt',['Schmidt']],
  ['Herr Müller\nKontrolle unauffällig.',['Müller']],
  ['Patientin heißt Anna   Müller.',['Anna   Müller']],
  ['Frau Koch. Der Koch sagte etwas.',['Koch']],
  ['Müller hat angerufen.',['Müller']],
  ['Herr Morgen.',['Morgen']]
];

describe('contextual names: synthetic positive and negative regressions',()=>{
  it.each(cases)('recognizes only the intended active name spans: %s',(source,expected)=>{
    const raw=scanPersonNames(source);
    for(const hit of raw){
      expect(source.slice(hit.start,hit.start+hit.text.length)).toBe(hit.text);
    }
    // Use actual overlap resolution; disable unrelated city/number categories
    // to isolate the name rules even with the larger production lexica.
    const names=detectPII(source,'auto',false,false)
      .filter(h=>['PERSON','FIRST_NAME','LAST_NAME'].includes(h.kind));
    const active=names.filter(h=>h.confidence!=='review');
    expect(active.map(h=>h.text)).toEqual(expected);
    let cursor=0;
    for(const hit of active){
      const start=source.indexOf(hit.text,cursor);
      expect(hit.start).toBe(start);
      expect(hit.end).toBe(start+hit.text.length);
      cursor=hit.end;
    }
    if(!expected.length)expect(names).toEqual([]);
    const masked=maskText(source,active);
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
  });
});
