import { findTerms } from './term-index';
/**
 * Rule-based PII candidates. A contextual name also becomes a temporary
 * document-wide detection term (with Unicode-aware word boundaries).
 */
export type Kind = 'PERSON' | 'FIRST_NAME' | 'LAST_NAME' | 'EMAIL' | 'PHONE' | 'IBAN' | 'DATE' | 'TIME' | 'OTHER';
export interface Finding {
  id: string;
  kind: Kind;
  text: string;
  start: number;
  end: number;
  origin: 'automatic' | 'manual';
}
export const KIND_LABELS: Record<Kind, string> = {
  PERSON:'Name', FIRST_NAME:'Vorname', LAST_NAME:'Nachname', EMAIL:'E-Mail', PHONE:'Telefon', IBAN:'IBAN', DATE:'Datum', TIME:'Uhrzeit', OTHER:'Sonstiges'
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

function ibanValid(value:string):boolean {
  const compact=value.replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact))return false;
  const moved=compact.slice(4)+compact.slice(0,4);
  let remainder=0;
  for(const char of moved){
    const expanded=char>='A'&&char<='Z'?String(char.charCodeAt(0)-55):char;
    for(const digit of expanded)remainder=(remainder*10+Number(digit))%97;
  }
  return remainder===1;
}

function candidate(kind:Kind,start:number,value:string,origin:Finding['origin'],prefix='auto'):Finding {
  return {id:prefix+'-'+kind+'-'+start+'-'+value.length,kind,text:value,start,end:start+value.length,origin};
}
export function removeOverlaps(findings:Finding[]):Finding[] {
  const priority=[...findings].sort((a,b)=>
    Number(b.origin==='manual')-Number(a.origin==='manual')
    ||(b.end-b.start)-(a.end-a.start)||a.start-b.start
  );
  const kept:Finding[]=[];
  for(const hit of priority)if(!kept.some(other=>overlaps(hit,other)))kept.push(hit);
  return kept.sort((a,b)=>a.start-b.start);
}
export function mergeManual(auto:Finding[],manual:Finding[]):Finding[]{
  return removeOverlaps([...manual,...auto]);
}
export function detectPII(text:string):Finding[]{
  const candidates:Finding[]=[];
  const knownNames=new Set<string>();
  const add=(kind:Kind,start:number,value:string)=>{
    if(value.trim())candidates.push(candidate(kind,start,value,'automatic'));
  };
  for(const match of text.matchAll(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g))add('EMAIL',match.index,match[0]);
  for(const match of text.matchAll(/(?<![\w\d])(?:\+49|0049|0[1-9])(?:[\s/()-]*\d){7,12}(?!\d)/g)){
    add('PHONE',match.index,match[0].trimEnd());
  }
  for(const match of text.matchAll(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi)){
    if(ibanValid(match[0]))add('IBAN',match.index,match[0]);
  }
  // Salutation-derived names. Keep full names together and learn the surname.
  for(const match of text.matchAll(/\b(?:Herrn?|Frau)\s+(?:(?:Dr|Prof)\.\s+)?([A-ZÄÖÜ][\p{L}\p{M}'-]+(?:\s+[A-ZÄÖÜ][\p{L}\p{M}'-]+)?)/gu)){
    const name=match[1];
    add('PERSON',match.index+match[0].lastIndexOf(name),name);
    knownNames.add(name);
    const parts=name.split(/\s+/);
    if(parts.length>1 && parts.at(-1)!.length>1) knownNames.add(parts.at(-1)!);
  }
  for(const hit of findTerms(text,[...knownNames]))
    candidates.push(candidate('PERSON',hit.start,hit.text,'automatic','learned'));
  return removeOverlaps(candidates);
}

/**
 * Automatic detection -> learned terms -> explicit source-anchored overrides.
 * Manual classifications outrank automatic, even when they split a larger hit.
 */
export function scanDocument(text:string,anchors:readonly Finding[]):Finding[]{
  const inferred=detectPII(text);
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
