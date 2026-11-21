import { describe, expect, it } from 'vitest';
import { analyze } from '../src/lib/analysis-engine';
import { bundledCityCount } from '../src/lib/geography';
import { bundledStreetCount } from '../src/lib/street-lexicon';
import { bundledGivenNameCount,bundledFamilyNameCount } from '../src/lib/person-names';
import { scanStreetLexicon } from '../src/lib/street-lexicon';
import { detectPII } from '../src/lib/detect';

function makeText(target:number):string{
  const part='Der Patient wurde untersucht. Laborwerte: Hb 9,1 g/dl und Puls 88/min. '+
    'Die Waren wurden geliefert. Frau Anna Müller wohnt in Bremen, Mohnblumenweg 12a. '+
    'Der Brief des Herrn Müllers wurde am 20.11.2026 verschickt.\n';
  return part.repeat(Math.ceil(target/part.length)).slice(0,target);
}
function run(text:string){
  return analyze({
    type:'analyze',id:1,text,manual:[],ignoredPlaces:[],ignoredTerms:[],
    numericOrder:'DMY',cityLexiconEnabled:true,rules:{},
    dateOptions:{dateShiftEnabled:false,numericOrder:'DMY'}
  });
}
describe('complete offline analysis performance',()=>{
  it('recognizes lexicon-only street names with explicit address context',()=>{
    const result=scanStreetLexicon('Anschrift: Lange Reihe 27; Adresse: Am Deich 4.');
    expect(result.map(hit=>hit.text)).toEqual(['Lange Reihe 27','Am Deich 4']);
    expect(detectPII('Name: Anna Müller, Lange Reihe 27').some(h=>h.kind==='ADDRESS')).toBe(true);
  });
  it('keeps morphology but does not mask every dictionary word automatically',()=>{
    const hits=detectPII('Anna Müller kommt aus Bremen. Die Waren wurden geliefert.');
    expect(hits.some(h=>h.kind==='PERSON' && h.text==='Anna Müller')).toBe(true);
    expect(hits.some(h=>h.kind==='CITY' && h.text==='Waren')).toBe(false);
  });
  it('benchmarks 10 KB, 100 KB and 1 MB whole-document scans with loaded lexica',()=>{
    const sizes=[10_000,100_000,1_000_000];
    const metrics:{chars:number;ms:number;found:number}[]=[];
    run(makeText(1000)); // warm up lazy caches
    for(const chars of sizes){
      const text=makeText(chars);
      const result=run(text);
      expect(result.prepared.text.length).toBeGreaterThan(0);
      expect(result.reviewed.findings.length).toBeGreaterThan(0);
      expect(result.prepared.mapping.length).toBeGreaterThan(0);
      metrics.push({chars,ms:Math.round(result.elapsedMs),found:result.reviewed.findings.length});
    }
    console.log('ANONYMAT_PERFORMANCE',JSON.stringify({
      lexica:{cities:bundledCityCount,streets:bundledStreetCount,given:bundledGivenNameCount,family:bundledFamilyNameCount},
      samples:metrics
    }));
    expect(metrics[2].ms).toBeLessThan(20000); // generous CI safety ceiling
  },60000);
});
