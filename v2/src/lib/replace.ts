import type { Finding, Kind } from './detect';
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
  warnings: string[];
}
export interface RestoredResult {
  text: string;
  missing: string[];
  unknown: string[];
}
const TOKEN_PATTERN = /\[[A-Z][A-Z0-9_]{2,63}\]/g;

/**
 * Replacement stage. The default is a typed, reversible token.
 * A per-group custom token is the only additional LIVE strategy; date/time
 * shifting and synthetic name/e-mail values remain explicitly unimplemented.
 */
export function maskText(
  source: string,
  active: readonly Finding[],
  rules: Readonly<Record<string, ReplacementRule>> = {}
): MaskedResult {
  const matches = [...active].sort((a,b)=>a.start-b.start);
  const counts: Partial<Record<Kind,number>> = {};
  const existing = new Map<string,string>();
  const used = new Map<string,string>();
  const mapping: MappingEntry[] = [];
  const warnings: string[] = [];
  let pos = 0;
  let output = '';

  // Reserve names requested by user rules to prevent generated token clashes.
  const reserved = new Set(Object.values(rules)
    .filter((rule): rule is Extract<ReplacementRule, {mode:'custom-token'}> => rule.mode === 'custom-token')
    .map(rule => rule.token));

  for(const match of matches){
    if(match.start<pos || source.slice(match.start,match.end)!==match.text)continue;
    const key=match.kind+':'+match.text; // exact spelling for a lossless restore
    let token=existing.get(key);
    if(!token){
      const spec=rules[replacementKey(match.kind,match.text)];
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
  return {text:output+source.slice(pos),mapping,warnings};
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
