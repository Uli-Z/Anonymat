import { parseDate, scanDates, shiftIsoDay, formatLike, WEEKDAYS, SHORT_WEEKDAYS, type NumericDateOrder, type DateReplacement } from './dates';
import type { Finding, Kind } from './detect';
import { scanPartialDates, parsePartialDate, partialOriginalIso, formatPartialLike, type ShiftedPartial } from './partial-dates';
import {
  replacementKey, validateCustomToken,
  type ReplacementRule
} from './replacement-strategies';

export interface MappingEntry {
  token: string;
  original: string;
  kind: Kind;
}
export interface MaskedResult {
  text: string;
  mapping: MappingEntry[];
  dates: DateReplacement[];
  partialDates: ShiftedPartial[];
  warnings: string[];
  /** Positions in the masked output that remain unmodified, unconfirmed review proposals. */
  reviewSpans: Array<{start:number;end:number;text:string}>;
}
export interface RestoredResult {
  text: string;
  missing: string[];
  unknown: string[];
}
export interface DateMaskOptions {
  dateShiftEnabled?: boolean;
  offsetDays?: number;
  numericOrder?: NumericDateOrder;
}
const TOKEN_PATTERN = /\[[A-Z][A-Z0-9_]{2,63}\]/g;

const weekdayNames=new Set(Object.keys(WEEKDAYS).flatMap(language=>
  [...WEEKDAYS[language as keyof typeof WEEKDAYS],...SHORT_WEEKDAYS[language as keyof typeof SHORT_WEEKDAYS]]
    .map(value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())
));
/** Without a year there is no reliable weekday to validate or recalculate. */
function hasAdjacentWeekday(source:string,start:number,end:number):boolean{
  const previous=source.slice(Math.max(0,start-22),start).match(/([\p{L}]+)\.?\s*,?\s*$/u);
  const following=source.slice(end,end+22).match(/^\s*,?\s*([\p{L}]+)\.?/u);
  return [previous?.[1],following?.[1]].some(raw=>raw &&
    weekdayNames.has(raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
}

/**
 * Replacement stage. The default is a typed, reversible token.
 * Date shifting is an opt-in global strategy with per-term overrides;
 * time shifting and synthetic values are not implemented.
 */
export function maskText(
  source: string,
  active: readonly Finding[],
  rules: Readonly<Record<string, ReplacementRule>> = {},
  dateOptions: DateMaskOptions = {},
  pending: readonly Finding[] = []
): MaskedResult {
  const matches = [...active].sort((a,b)=>a.start-b.start);
  const counts: Partial<Record<Kind,number>> = {};
  const existing = new Map<string,string>();
  const used = new Map<string,string>();
  // Prevent O(document size × number of unique replacements) rescans.
  const preexistingTokens=new Set(source.match(TOKEN_PATTERN) ?? []);
  const mapping: MappingEntry[] = [];
  const dates: DateReplacement[] = [];
  const partialDates: ShiftedPartial[] = [];
  // Resolve contextual partials by original offsets (e.g. "im März" marks just "März").
  const partialBySpan=new Map(scanPartialDates(source,{numericOrder:dateOptions.numericOrder})
    .map(hit=>[hit.start+':'+hit.end,hit] as const));
  const warnings: string[] = [];
  for(const item of scanDates(source,{numericOrder:dateOptions.numericOrder}).issues){
    warnings.push('Datum "'+item.text+'": '+item.reason+' – bitte manuell prüfen.');
  }
  let pos = 0;
  let output = '';
  const pendingSorted=[...pending].sort((a,b)=>a.start-b.start);
  const reviewSpans:Array<{start:number;end:number;text:string}>=[];
  let reviewIndex=0;
  // Record exact output positions while copying unchanged source fragments;
  // this is reliable even when tokens or shifted dates change their length.
  function appendUnchanged(end:number):void{
    const offset=output.length;
    while(reviewIndex<pendingSorted.length && pendingSorted[reviewIndex].end<=pos)reviewIndex++;
    while(reviewIndex<pendingSorted.length && pendingSorted[reviewIndex].start<end){
      const hit=pendingSorted[reviewIndex++];
      if(hit.start<pos || hit.end>end || source.slice(hit.start,hit.end)!==hit.text)continue;
      reviewSpans.push({start:offset+hit.start-pos,end:offset+hit.end-pos,text:hit.text});
    }
    output+=source.slice(pos,end);
  }

  // Reserve names requested by user rules to prevent generated token clashes.
  const reserved = new Set(Object.values(rules)
    .filter((rule): rule is Extract<ReplacementRule, {mode:'custom-token'}> => rule.mode === 'custom-token')
    .map(rule => rule.token));

  for(const match of matches){
    if(match.start<pos || source.slice(match.start,match.end)!==match.text)continue;
    const spec = rules[replacementKey(match.kind,match.text)];
    const shiftThisDate = match.kind==='DATE' &&
      (spec?.mode==='shift-date' ||
       (dateOptions.dateShiftEnabled && spec?.mode!== 'token' && spec?.mode!=='custom-token'));
    if(shiftThisDate){
      const parsed=parseDate(match.text,{numericOrder:dateOptions.numericOrder});
      const offset=dateOptions.offsetDays;
      const validOffset=Number.isSafeInteger(offset) && offset!==0 && Math.abs(offset as number)<=3650;
      const changed=parsed && validOffset ?shiftIsoDay(parsed.iso,offset as number):null;
      if(changed && parsed){
        const shifted=formatLike(changed,parsed);
        appendUnchanged(match.start);
        output+=shifted;
        dates.push({original:match.text,shifted,shiftedIso:changed});
        pos=match.end;
        continue;
      }
      const partial=!parsed
        ? partialBySpan.get(match.start+':'+match.end)
          ?? parsePartialDate(match.text,{numericOrder:dateOptions.numericOrder})
        :null;
      const originalIso=partial?partialOriginalIso(partial):null;
      const weekdayNear=!!partial && hasAdjacentWeekday(source,match.start,match.end);
      const shiftedIso=originalIso && validOffset && !weekdayNear
        ?shiftIsoDay(originalIso,offset as number):null;
      if(shiftedIso && originalIso && partial){
        const shifted=formatPartialLike(shiftedIso,partial);
        output+=source.slice(pos,match.start)+shifted;
        partialDates.push({original:match.text,shifted,originalIso,shiftedIso});
        pos=match.end;
        continue;
      }
      if(weekdayNear){
        warnings.push('Unvollständiges Datum "'+match.text+'" mit Wochentag wird nicht verschoben; bitte als Token prüfen.');
      }else if(partial && ['month-year','month-only','year-only','day-only'].includes(partial.precision)){
        warnings.push('"' + match.text + '" enthält keinen bestimmten Kalendertag und wird als Token ersetzt.');
      }else{
        warnings.push('Datum "'+match.text+'" konnte nicht sicher verschoben werden; stattdessen als Token ersetzt.');
      }
    }
    const key=match.kind+':'+match.text; // exact spelling for a lossless restore
    let token=existing.get(key);
    if(!token){
      if(spec?.mode==='custom-token') {
        const error=validateCustomToken(spec.token);
        if(error || preexistingTokens.has(spec.token) || used.has(spec.token)) {
          warnings.push('Ersatzwert für '+match.text+' ist nicht eindeutig oder ungültig.');
        } else token=spec.token;
      }
      if(!token){
        let next=(counts[match.kind]??0)+1;
        token='['+match.kind+'_'+String(next).padStart(3,'0')+']';
        while(preexistingTokens.has(token) || used.has(token) || reserved.has(token)){
          next++;
          token='['+match.kind+'_'+String(next).padStart(3,'0')+']';
        }
        counts[match.kind]=next;
      }
      existing.set(key,token);
      used.set(token,key);
      mapping.push({token,original:match.text,kind:match.kind});
    }
    appendUnchanged(match.start);
    output += token;
    pos=match.end;
  }
  appendUnchanged(source.length);
  return {text:output,mapping,dates,partialDates,warnings,reviewSpans};
}

export function restoreText(input:string,mapping:readonly MappingEntry[]):RestoredResult{
  const lookup=new Map(mapping.map(entry=>[entry.token,entry.original]));
  const seen=new Set<string>();
  const unknown:string[]=[];
  // One pass: do not accidentally replace placeholders within original values.
  const text=input.replace(TOKEN_PATTERN,token=>{
    if(lookup.has(token)){
      seen.add(token);
      return lookup.get(token)!;
    }
    if(!unknown.includes(token))unknown.push(token);
    return token;
  });
  return {
    text,
    missing:mapping.filter(entry=>!seen.has(entry.token)).map(entry=>entry.token),
    unknown
  };
}
export interface PreviewPart {value:string;token:boolean;review?:boolean}
export function splitForPreview(
  value:string,
  reviews:readonly {start:number;end:number;text:string}[]=[]
):PreviewPart[]{
  const parts:PreviewPart[]=[];
  const addPlain=(from:number,to:number):void=>{
    if(to<=from)return;
    const segment=value.slice(from,to);
    let last=0;
    for(const match of segment.matchAll(TOKEN_PATTERN)){
      if(match.index>last)parts.push({value:segment.slice(last,match.index),token:false});
      parts.push({value:match[0],token:true});
      last=match.index+match[0].length;
    }
    if(last<segment.length)parts.push({value:segment.slice(last),token:false});
  };
  let pos=0;
  for(const review of [...reviews].sort((a,b)=>a.start-b.start)){
    if(review.start<pos || review.end>value.length || review.start>=review.end
      || value.slice(review.start,review.end)!==review.text)continue;
    addPlain(pos,review.start);
    parts.push({value:review.text,token:false,review:true});
    pos=review.end;
  }
  addPlain(pos,value.length);
  return parts;
}
