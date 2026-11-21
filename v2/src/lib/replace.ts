import { parseDate, scanDates, shiftIsoDay, formatLike, type NumericDateOrder, type DateReplacement } from './dates';
import type { Finding, Kind } from './detect';
import { parsePartialDate, partialOriginalIso, formatPartialLike, type ShiftedPartial } from './partial-dates';
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
  partialReferenceYear?: number | null;
}
const TOKEN_PATTERN = /\[[A-Z][A-Z0-9_]{2,63}\]/g;

/**
 * Replacement stage. The default is a typed, reversible token.
 * Date shifting is an opt-in global strategy with per-term overrides;
 * time shifting and synthetic values are not implemented.
 */
export function maskText(
  source: string,
  active: readonly Finding[],
  rules: Readonly<Record<string, ReplacementRule>> = {},
  dateOptions: DateMaskOptions = {}
): MaskedResult {
  const matches = [...active].sort((a,b)=>a.start-b.start);
  const counts: Partial<Record<Kind,number>> = {};
  const existing = new Map<string,string>();
  const used = new Map<string,string>();
  const mapping: MappingEntry[] = [];
  const dates: DateReplacement[] = [];
  const partialDates: ShiftedPartial[] = [];
  const warnings: string[] = [];
  for(const item of scanDates(source,{numericOrder:dateOptions.numericOrder}).issues){
    warnings.push('Datum "'+item.text+'": '+item.reason+' – bitte manuell prüfen.');
  }
  let pos = 0;
  let output = '';

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
        output+=source.slice(pos,match.start)+shifted;
        dates.push({original:match.text,shifted,shiftedIso:changed});
        pos=match.end;
        continue;
      }
      const partial=!parsed?parsePartialDate(match.text,{numericOrder:dateOptions.numericOrder}):null;
      const originalIso=partial?partialOriginalIso(partial,dateOptions.partialReferenceYear):null;
      const shiftedIso=originalIso && validOffset?shiftIsoDay(originalIso,offset as number):null;
      if(shiftedIso && originalIso && partial){
        const shifted=formatPartialLike(shiftedIso,partial);
        output+=source.slice(pos,match.start)+shifted;
        partialDates.push({original:match.text,shifted,originalIso,shiftedIso});
        pos=match.end;
        continue;
      }
      if(partial?.precision==='month-year'||partial?.precision==='month-only'){
        warnings.push('"' + match.text + '" enthält keinen bestimmten Kalendertag und wird als Token ersetzt.');
      }else if(partial?.precision==='day-month' && !dateOptions.partialReferenceYear){
        warnings.push('"' + match.text + '" hat kein Jahr: Bitte Bezugsjahr festlegen, sonst wird ein Token verwendet.');
      }else{
        warnings.push('Datum "'+match.text+'" konnte nicht sicher verschoben werden; stattdessen als Token ersetzt.');
      }
    }
    const key=match.kind+':'+match.text; // exact spelling for a lossless restore
    let token=existing.get(key);
    if(!token){
      if(spec?.mode==='custom-token') {
        const error=validateCustomToken(spec.token);
        if(error || source.includes(spec.token) || used.has(spec.token)) {
          warnings.push('Ersatzwert für '+match.text+' ist nicht eindeutig oder ungültig.');
        } else token=spec.token;
      }
      if(!token){
        let next=(counts[match.kind]??0)+1;
        token='['+match.kind+'_'+String(next).padStart(3,'0')+']';
        while(source.includes(token) || used.has(token) || reserved.has(token)){
          next++;
          token='['+match.kind+'_'+String(next).padStart(3,'0')+']';
        }
        counts[match.kind]=next;
      }
      existing.set(key,token);
      used.set(token,key);
      mapping.push({token,original:match.text,kind:match.kind});
    }
    output += source.slice(pos,match.start)+token;
    pos=match.end;
  }
  return {text:output+source.slice(pos),mapping,dates,partialDates,warnings};
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
export interface PreviewPart {value:string;token:boolean}
export function splitForPreview(value:string):PreviewPart[]{
  const parts:PreviewPart[]=[];
  let last=0;
  for(const match of value.matchAll(TOKEN_PATTERN)){
    if(match.index>last)parts.push({value:value.slice(last,match.index),token:false});
    parts.push({value:match[0],token:true});
    last=match.index+match[0].length;
  }
  if(last<value.length)parts.push({value:value.slice(last),token:false});
  return parts;
}
