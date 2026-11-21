import knownCities from '../data/europe-cities.json';

export interface CityHit { start:number; end:number; text:string }
const fold = (value:string):string => value.normalize('NFC').toLocaleLowerCase('de');
const clearlyGeographic = new Set('Amsterdam Berlin Bern Bremen Brüssel Budapest Dublin Hamburg Helsinki Köln Kopenhagen Lissabon London Madrid München Oslo Paris Prag Rom Stockholm Stuttgart Wien Zürich'.split(' ').map(fold));
const ambiguous = new Set('Essen Waren Lage Halle Leer Norden Wetter Forst Mengen Bünde Stein Heide Burg'.split(' ').map(fold));
const wordPattern = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;
let defaultIndex: Set<string>|undefined;

function dictionary(names:readonly string[]):Set<string>{
  if(names===knownCities && defaultIndex)return defaultIndex;
  const index=new Set(names.map(fold).filter(name=>name.length>=3));
  if(names===knownCities)defaultIndex=index;
  return index;
}

function hasPlaceContext(text:string,start:number):boolean{
  const before=text.slice(Math.max(0,start-64),start);
  // Directly following an address, or an explicit location label/preposition.
  return /(?:^|[^\p{L}])(?:in|nach|aus|bei|von|ausgehend von|wohnhaft in|geboren in|wohnort|geburtsort|ort|stadt|gemeinde|anschrift|adresse|plz|postleitzahl)\s*(?::|,)?\s*(?:der|dem|den)?\s*$/iu.test(before)
    || /(?:^|[^\d])(?:\d{4,6})\s*$/u.test(before)
    || /(?:^|[^\p{L}])(?:aus der stadt|in der stadt|im raum)\s*$/iu.test(before);
}

/**
 * Local dictionary matching, bounded to six words per candidate.
 * No regex is compiled per city; construction is O(dictionary size),
 * scanning O(words * 6) with hash lookups. UTF-16 source offsets survive.
 * GeoNames sets are a gazetteer, not proof that an ambiguous word is a place.
 */
export function scanCities(text:string,names:readonly string[]=knownCities):CityHit[]{
  if(!text || names.length===0)return [];
  const lookup=dictionary(names);
  const words=[...text.matchAll(wordPattern)];
  const hits:CityHit[]=[];
  for(let i=0;i<words.length;i++){
    const first=words[i],start=first.index;
    if(start===undefined)continue;
    if(!/^\p{Lu}/u.test(first[0]))continue;
    let end=start;
    for(let j=i;j<Math.min(words.length,i+6);j++){
      const part=words[j], partStart=part.index;
      if(partStart===undefined)break;
      if(j!==i && !/^[\s-]+$/u.test(text.slice(end,partStart)))break;
      end=partStart+part[0].length;
      const raw=text.slice(start,end),key=fold(raw);
      if(!lookup.has(key))continue;
      if(hasPlaceContext(text,start) || (clearlyGeographic.has(key) && !ambiguous.has(key)))
        hits.push({start,end,text:raw});
    }
  }
  return hits;
}

export const bundledCityCount=knownCities.length;
