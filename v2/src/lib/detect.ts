import { scanPartialDates } from './partial-dates';
import { scanDates, type NumericDateOrder } from './dates';
import { findTerms } from './term-index';
import { scanStructuredPII } from './structured-pii';
import { scanNumbers } from './numbers';
import { scanContextMarkers } from './context-markers';
import { scanPersonNames } from './person-names';
import { scanCities } from './geography';
import { scanStreetLexicon } from './street-lexicon';
/**
 * Rule-based PII candidates. A contextual name also becomes a temporary
 * document-wide detection term (with Unicode-aware word boundaries).
 */
import { overlaps } from './detect-types';
import type { LearnedRule } from './learned-rules';
export { KIND_LABELS, sameTerm, overlaps } from './detect-types';
export type { Kind, Finding } from './detect-types';
import type { Kind, Finding } from './detect-types';
export function wholeTermMatches(text: string, term: string): Array<{start:number; end:number; text:string}> {
  return findTerms(text, [term]);
}

function candidate(kind:Kind,start:number,value:string,origin:Finding['origin'],prefix='auto',confidence?:Finding['confidence']):Finding {
  return {id:prefix+'-'+kind+'-'+start+'-'+value.length,kind,text:value,start,end:start+value.length,origin,...(confidence?{confidence}:{})};
}
/**
 * Priority is manual > longer > earlier. Occupied UTF-16 positions let us
 * discard overlaps in O(total candidates + covered characters) rather than
 * comparing every candidate against every previously accepted hit.
 */
export function removeOverlaps(findings:Finding[]):Finding[] {
  if(!findings.length)return [];
  const rank=(hit:Finding):number=>hit.origin==='manual'?4:hit.origin==='learned' && hit.confidence!=='review'?3:hit.origin==='automatic' && hit.confidence!=='review'?2:hit.origin==='learned'?1:0;
  const priority=[...findings].sort((a,b)=>
    rank(b)-rank(a)
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
export function detectPII(text:string,numericOrder:NumericDateOrder='auto',enableCities=true,enableNumbers=false):Finding[]{
  const candidates:Finding[]=[];
  const add=(kind:Kind,start:number,value:string,confidence?:Finding['confidence']):void=>{
    if(value.trim())candidates.push(candidate(kind,start,value,'automatic','auto',confidence));
  };
  const fullDates=scanDates(text,{numericOrder}).matches;
  const partialDates=scanPartialDates(text,{numericOrder});
  // A short date followed by a dash and a full date is TWO date findings.
  // Guard the two real dates against the general telephone regex without
  // converting the complete expression into a separate range finding.
  const connectedDates=partialDates.filter(partial=>partial.precision==='day-month')
    .flatMap(partial=>fullDates.filter(full=>
      full.start>partial.end && full.start-partial.end<=8
      && /^\s*[-–—]\s*$/u.test(text.slice(partial.end,full.start))
    ).map(full=>({start:partial.start,end:full.end})));
  for(const hit of scanStructuredPII(text)){
    if(hit.kind==='PHONE' && connectedDates.some(pair=>
      hit.start<pair.end && pair.start<hit.start+hit.text.length))continue;
    add(hit.kind,hit.start,hit.text);
  }
  for(const hit of scanStreetLexicon(text))add(hit.hasNumber?'ADDRESS':'STREET',hit.start,hit.text);
  for(const hit of fullDates)add('DATE',hit.start,hit.text);
  for(const hit of partialDates)add('DATE',hit.start,hit.text);
  // Context markers are added before dictionary-only name proposals, so
  // an equally uncertain slash signature is consistently a surname proposal.
  for(const hit of scanContextMarkers(text))add(hit.kind,hit.start,hit.text,hit.confidence);
  for(const hit of scanPersonNames(text))add(hit.kind,hit.start,hit.text,hit.confidence);
  if(enableCities)for(const hit of scanCities(text))add('CITY',hit.start,hit.text);
  // Numbers are the last-resort fallback. A longer "number" such as
  // "-10.01.2025" must never outrank a valid DATE, ID, address or other
  // recognized entity just because it includes a leading dash.
  if(enableNumbers)for(const hit of scanNumbers(text)){
    if(candidates.some(item=>item.kind!=='NUMBER'
      && hit.start<item.end && item.start<hit.end))continue;
    add('NUMBER',hit.start,hit.text);
  }
  return removeOverlaps(candidates);
}

/**
 * Automatic detection -> learned terms -> explicit source-anchored overrides.
 * Manual classifications outrank automatic, even when they split a larger hit.
 */
export function scanDocument(text:string,anchors:readonly Finding[],numericOrder:NumericDateOrder='auto',enableCities=true,remembered:readonly LearnedRule[]=[],enableNumbers=false):Finding[]{
  const inferred=detectPII(text,numericOrder,enableCities,enableNumbers);
  const manual:Finding[]=[];
  const learned=new Map<string,{term:string;kind:Kind;anchorId:string;stored:boolean}>();
  for(const rule of remembered){
    if(!rule.term || !rule.key)continue;
    const add=(term:string):void=>{
      const key=term.toLocaleLowerCase('de');
      if(key && !learned.has(key))learned.set(key,{term,kind:rule.kind,anchorId:rule.key,stored:true});
    };
    add(rule.term);
    const parts=rule.kind==='PERSON'?rule.term.trim().split(/\s+/):[];
    const last=parts.length>1?parts.at(-1)!:rule.term;
    if(parts.length>1 && last.length>2)add(last);
    if((rule.kind==='LAST_NAME'||rule.kind==='PERSON') && last.length>2 && !/[sxzß]$/iu.test(last)){
      add(last+'s');add(last+"'s");add(last+'’s');
    }
  }
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
      if(key)learned.set(key,{term,kind:anchor.kind,anchorId:anchor.id,stored:false});
    }
  }
  for(const hit of findTerms(text,[...learned.values()].map(rule=>rule.term))){
    const rule=learned.get(hit.term.toLocaleLowerCase('de'));
    if(!rule)continue;
    // All stored, previously confirmed terms are active. Only uncertain
    // dictionary/pattern detections require a review.
    const found=candidate(rule.kind,hit.start,hit.text,rule.stored?'learned':'manual','repeated-'+rule.anchorId);
    if(rule.stored)found.learnedRuleKey=rule.anchorId;
    manual.push(found);
  }
  return mergeManual(inferred,manual);
}
