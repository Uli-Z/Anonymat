import type { Kind } from './detect-types';
import givenNames from '../data/given-names.json';
import familyNames from '../data/family-names.json';
import cities from '../data/europe-cities.json';
import streets from '../data/street-names.json';

/** Only categories with a meaningful, locally available surrogate lexicon. */
export function supportsSynthetic(kind:Kind):boolean {
  return kind==='PERSON'||kind==='FIRST_NAME'||kind==='LAST_NAME'
    ||kind==='CITY'||kind==='STREET'||kind==='ADDRESS';
}

const fold=(value:string)=>value.normalize('NFC').toLocaleLowerCase('de');
const knownGiven=new Set([...givenNames,'Ulrich'].map(fold));
const knownFamily=new Set(familyNames.map(fold));

function hash(seed:number,key:string):number {
  let value=(2166136261 ^ (seed>>>0))>>>0;
  for(let i=0;i<key.length;i++){
    value=Math.imul(value ^ key.charCodeAt(i),16777619)>>>0;
  }
  return value>>>0;
}
function escapeRegExp(value:string):string {
  return value.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&');
}
function presentInSource(source:string,value:string):boolean {
  const pattern=new RegExp('(^|[^\\p{L}\\p{N}\\p{M}])'+escapeRegExp(value)+'(?=$|[^\\p{L}\\p{N}\\p{M}])','iu');
  return pattern.test(source);
}
function matchCase(value:string,original:string):string {
  if(original===original.toUpperCase() && original!==original.toLowerCase())return value.toLocaleUpperCase('de');
  if(original===original.toLowerCase() && original!==original.toUpperCase())return value.toLocaleLowerCase('de');
  return value;
}
function pick(
  family:'given'|'family'|'city'|'street',original:string,
  seed:number,source:string,assignments:Map<string,string>
):string|null{
  const key=family+':'+fold(original);
  if(assignments.has(key))return assignments.get(key)!;
  const values=family==='given'?givenNames:family==='family'?familyNames:family==='city'?cities:streets;
  const start=hash(seed,key)%values.length;
  const occupied=new Set([...assignments.values()].map(fold));
  for(let i=0;i<values.length;i++){
    const choice=values[(start+i)%values.length];
    if(fold(choice)===fold(original)||occupied.has(fold(choice))||presentInSource(source,choice))continue;
    assignments.set(key,choice);
    return choice;
  }
  return null;
}
function surnameStem(value:string):{root:string;ending:string}{
  const apostrophe=/^(.+)(['’]s)$/iu.exec(value);
  if(apostrophe && knownFamily.has(fold(apostrophe[1])))return {root:apostrophe[1],ending:apostrophe[2]};
  if(value.endsWith('s') && knownFamily.has(fold(value.slice(0,-1))))
    return {root:value.slice(0,-1),ending:'s'};
  return {root:value,ending:''};
}
function surname(value:string,seed:number,source:string,assignments:Map<string,string>):string|null{
  const stem=surnameStem(value);
  const selected=pick('family',stem.root,seed,source,assignments);
  return selected?matchCase(selected,stem.root)+stem.ending:null;
}
function firstname(value:string,seed:number,source:string,assignments:Map<string,string>):string|null{
  const selected=pick('given',value,seed,source,assignments);
  return selected?matchCase(selected,value):null;
}

/**
 * A document-specific seed comes from Web Crypto in the UI. The same source
 * value and its name components keep a stable surrogate across rescans.
 * No generated pseudonym may reproduce another original word in this document.
 */
export function syntheticReplacement(
  kind:Kind,original:string,seed:number,source:string,assignments:Map<string,string>
):string|null{
  if(!supportsSynthetic(kind))return null;
  if(kind==='FIRST_NAME')return firstname(original,seed,source,assignments);
  if(kind==='LAST_NAME')return surname(original,seed,source,assignments);
  if(kind==='CITY'||kind==='STREET'){
    const selected=pick(kind==='CITY'?'city':'street',original,seed,source,assignments);
    return selected?matchCase(selected,original):null;
  }
  if(kind==='ADDRESS'){
    const match=/^(.+?)\s+(\d{1,4})([a-zA-Z]?)$/u.exec(original);
    if(!match)return null; // Unknown structured addresses stay typed tokens.
    const street=syntheticReplacement('STREET',match[1],seed,source,assignments);
    if(!street)return null;
    const number=1+(hash(seed,'house:'+fold(original))%199);
    return street+' '+number+match[3];
  }
  // A name can be a contextual surname alone, or a full first/last name.
  const names=original.trim().split(/\s+/u);
  if(!names.length || !names.every(name=>/^\p{L}[\p{L}\p{M}'’-]*$/u.test(name)))return null;
  if(names.length===1){
    return knownGiven.has(fold(names[0]))
      ?firstname(names[0],seed,source,assignments)
      :surname(names[0],seed,source,assignments);
  }
  const first=firstname(names[0],seed,source,assignments);
  const last=surname(names.at(-1)!,seed,source,assignments);
  if(!first||!last)return null;
  if(names.length===2)return first+' '+last;
  const middle=names.slice(1,-1);
  if(middle.some(part=>/^(von|van|de|zu)$/iu.test(part)))return first+' '+middle.join(' ')+' '+last;
  const inner=middle.map(name=>firstname(name,seed,source,assignments));
  return inner.some(name=>!name)?null:[first,...inner,last].join(' ');
}
