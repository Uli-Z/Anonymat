import { scanPartialDates } from './partial-dates';
import { scanDates, type NumericDateOrder } from './dates';
import { findTerms } from './term-index';
import { scanStructuredPII } from './structured-pii';
import { scanPersonNames } from './person-names';
import { scanCities } from './geography';
import { scanStreetLexicon } from './street-lexicon';
/**
 * Rule-based PII candidates. A contextual name also becomes a temporary
 * document-wide detection term (with Unicode-aware word boundaries).
 */
export type Kind = 'PERSON' | 'FIRST_NAME' | 'LAST_NAME' | 'EMAIL' | 'PHONE' | 'IBAN' | 'DATE' | 'TIME' | 'ADDRESS' | 'STREET' | 'CITY' | 'POSTAL_CODE' | 'URL' | 'IP' | 'BIC' | 'ID' | 'LICENSE_PLATE' | 'OTHER';
export interface Finding {
  id: string;
  kind: Kind;
  text: string;
  start: number;
  end: number;
  origin: 'automatic' | 'manual';
}
export const KIND_LABELS: Record<Kind, string> = {
  PERSON:'Name', FIRST_NAME:'Vorname', LAST_NAME:'Nachname', EMAIL:'E-Mail', PHONE:'Telefon', IBAN:'IBAN', DATE:'Datum', TIME:'Uhrzeit',
  ADDRESS:'Adresse', STREET:'Straße', CITY:'Ort / Stadt', POSTAL_CODE:'Postleitzahl', URL:'Webadresse', IP:'IP-Adresse',
  BIC:'BIC / SWIFT', ID:'Kennnummer / Aktenzeichen', LICENSE_PLATE:'Kfz-Kennzeichen', OTHER:'Sonstiges'
};
export function sameTerm(a:string,b:string):boolean {
  return a.normalize('NFC').toLocaleLowerCase('de') === b.normalize('NFC').toLocaleLowerCase('de');
}
export function overlaps(a:Pick<Finding,'start'|'end'>, b:Pick<Finding,'start'|'end'>):boolean {
  return a.start<b.end && b.start<a.end;
}

export function wholeTermMatches(text: string, term: string): Array<{start:number; end:number; text:string}> {
  return findTerms(text, [term]);
}

function candidate(kind:Kind,start:number,value:string,origin:Finding['origin'],prefix='auto'):Finding {
  return {id:prefix+'-'+kind+'-'+start+'-'+value.length,kind,text:value,start,end:start+value.length,origin};
}
/**
 * Priority is manual > longer > earlier. Occupied UTF-16 positions let us
 * discard overlaps in O(total candidates + covered characters) rather than
 * comparing every candidate against every previously accepted hit.
 */
export function removeOverlaps(findings:Finding[]):Finding[] {
  if(!findings.length)return [];
  const priority=[...findings].sort((a,b)=>
    Number(b.origin==='manual')-Number(a.origin==='manual')
    ||(b.end-b.start)-(a.end-a.start)||a.start-b.start
  );
  let maxEnd=0;
  for(const finding of priority)if(finding.end>maxEnd)maxEnd=finding.end;
  const occupied=new Uint8Array(maxEnd);
  const kept:Finding[]=[];
  for(const hit of priority){
    if(hit.start<0 || hit.end>maxEnd || hit.start>=hit.end)continue;
    let collision=false;
    for(let i=hit.start;i<hit.end;i++){
      if(occupied[i]){collision=true;break;}
    }
    if(collision)continue;
    occupied.fill(1,hit.start,hit.end);
    kept.push(hit);
  }
  return kept.sort((a,b)=>a.start-b.start);
}
export function mergeManual(auto:Finding[],manual:Finding[]):Finding[]{
  return removeOverlaps([...manual,...auto]);
}
export function detectPII(text:string,numericOrder:NumericDateOrder='auto',enableCities=true):Finding[]{
  const candidates:Finding[]=[];
  const add=(kind:Kind,start:number,value:string):void=>{
    if(value.trim())candidates.push(candidate(kind,start,value,'automatic'));
  };
  for(const hit of scanStructuredPII(text))add(hit.kind,hit.start,hit.text);
  for(const hit of scanStreetLexicon(text))add(hit.hasNumber?'ADDRESS':'STREET',hit.start,hit.text);
  for(const hit of scanDates(text,{numericOrder}).matches)add('DATE',hit.start,hit.text);
  for(const hit of scanPartialDates(text,{numericOrder}))add('DATE',hit.start,hit.text);
  for(const hit of scanPersonNames(text))add('PERSON',hit.start,hit.text);
  if(enableCities)for(const hit of scanCities(text))add('CITY',hit.start,hit.text);
  return removeOverlaps(candidates);
}

/**
 * Automatic detection -> learned terms -> explicit source-anchored overrides.
 * Manual classifications outrank automatic, even when they split a larger hit.
 */
export function scanDocument(text:string,anchors:readonly Finding[],numericOrder:NumericDateOrder='auto',enableCities=true):Finding[]{
  const inferred=detectPII(text,numericOrder,enableCities);
  const manual:Finding[]=[];
  const learned=new Map<string,{term:string;kind:Kind;anchorId:string}>();
  for(const anchor of anchors){
    if(text.slice(anchor.start,anchor.end)!==anchor.text)continue;
    manual.push(anchor);
    const terms=[anchor.text];
    if(anchor.kind==='PERSON'){
      const parts=anchor.text.trim().split(/\s+/);
      if(parts.length>1 && parts.at(-1)!.length>1)terms.push(parts.at(-1)!);
    }
    if(anchor.kind==='LAST_NAME' || anchor.kind==='PERSON'){
      const last=terms.at(-1)!;
      if(last.length>2 && !/[sxzß]$/iu.test(last))terms.push(last+'s',last+"'s",last+'’s');
    }
    for(const term of terms){
      const key=term.toLocaleLowerCase('de');
      if(key && !learned.has(key))learned.set(key,{term,kind:anchor.kind,anchorId:anchor.id});
    }
  }
  for(const hit of findTerms(text,[...learned.values()].map(rule=>rule.term))){
    const rule=learned.get(hit.term.toLocaleLowerCase('de'));
    if(!rule)continue;
    manual.push(candidate(rule.kind,hit.start,hit.text,'manual','repeated-'+rule.anchorId));
  }
  return mergeManual(inferred,manual);
}
