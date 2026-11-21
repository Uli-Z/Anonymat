import knownCities from '../data/europe-cities.json';
import prominentCities from '../data/europe-prominent-cities.json';
import commonCityCollisions from '../data/de-common-city-collisions.json';

export interface CityHit { start:number; end:number; text:string }
const fold = (value:string):string => value.normalize('NFC').toLocaleLowerCase('de');
const wordPattern = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;
const commonWords = new Set(commonCityCollisions.map(fold));
const prominent = new Set(prominentCities.map(fold));
let defaultIndex: Set<string>|undefined;

/** This is corpus evidence of another ordinary-word use, never proof of exclusivity. */
export function hasCommonWordMeaning(city:string):boolean {
  return commonWords.has(fold(city));
}
export const bundledCityCount=knownCities.length;
export const commonCityCollisionCount=commonWords.size;

function dictionary(names:readonly string[]):Set<string>{
  if(names===knownCities && defaultIndex)return defaultIndex;
  const index=new Set(names.map(fold).filter(name=>name.length>=3));
  if(names===knownCities)defaultIndex=index;
  return index;
}

function hasPlaceContext(text:string,start:number):boolean{
  const before=text.slice(Math.max(0,start-64),start);
  return /(?:^|[^\p{L}])(?:in|nach|aus|bei|von|ausgehend von|wohnhaft in|geboren in|wohnort|geburtsort|ort|stadt|gemeinde|anschrift|adresse|plz|postleitzahl)\s*(?::|,)?\s*(?:der|dem|den)?\s*$/iu.test(before)
    || /(?:^|[^\d])(?:\d{4,6})\s*$/u.test(before)
    || /(?:^|[^\p{L}])(?:aus der stadt|in der stadt|im raum)\s*$/iu.test(before);
}

/**
 * GeoNames settlement-name matching + corpus POS contrast.
 *
 * The ordinary-word collisions were derived from tokens actually tagged
 * NOUN/VERB/ADJ/etc., not from an unfiltered dictionary containing place names.
 * PROPN-only tokens are *not* counted as ordinary words. However, corpus
 * coverage is incomplete: no collision does NOT imply a uniquely geographic
 * meaning. Accordingly, most non-prominent one-word places still need context.
 * Large settlements use a >=50,000 inhabitant threshold generated from GeoNames.
 *
 * One Set lookup per candidate (up to 6 words), no regex per place name.
 * Original UTF-16 offsets preserved. All resources are bundled for offline use.
 */
export function scanCities(text:string,names:readonly string[]=knownCities):CityHit[]{
  if(!text || names.length===0)return [];
  const lookup=dictionary(names);
  const words=[...text.matchAll(wordPattern)];
  const hits:CityHit[]=[];
  for(let i=0;i<words.length;i++){
    const first=words[i],start=first.index;
    if(start===undefined || !/^\p{Lu}/u.test(first[0]))continue;
    let end=start;
    for(let j=i;j<Math.min(words.length,i+6);j++){
      const part=words[j], partStart=part.index;
      if(partStart===undefined)break;
      if(j!==i && !/^[\s-]+$/u.test(text.slice(end,partStart)))break;
      end=partStart+part[0].length;
      const raw=text.slice(start,end),key=fold(raw);
      if(!lookup.has(key))continue;
      const contextual=hasPlaceContext(text,start);
      const homonym=commonWords.has(key);
      // Corpus evidence for ordinary usage overrides the population shortcut.
      // Multiword place names without contextual support are uncommon enough
      // to propose, unless observed as an ordinary expression in the corpus.
      const selfExplanatory=!homonym && (prominent.has(key) || /\s|-/.test(raw));
      if(contextual || selfExplanatory)hits.push({start,end,text:raw});
    }
  }
  return hits;
}
