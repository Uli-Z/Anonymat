import streetNames from '../data/street-names.json';

export interface StreetHit {start:number;end:number;text:string;hasNumber:boolean}
export const bundledStreetCount=streetNames.length;
const fold=(text:string)=>text.normalize('NFC').toLocaleLowerCase('de');
const streets=new Set(streetNames.map(fold));
const word=/[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;
const HOUSE=/^\s+(\d{1,4}[a-zA-Z]?(?:[-/]\d{1,4}[a-zA-Z]?)?)(?![\d])/u;
const locationHint=/(?:^|[^\p{L}])(?:straße|strasse|straßenname|adresse|anschrift|wohnhaft|wohnort|wohnt|wohne|in der|an der|auf der|am|im|beim|bei der|zur|zum)\s*[:=]?\s*$/iu;

/** Hash-based exact lookup: bounded to at most five tokens per potential street.
 * Unknown generic words are NEVER auto-classified solely for being in OSM.
 * Full street records are consolidated at build-time, so duplicate OSM ways
 * do not slow the matching process.
 */
export function scanStreetLexicon(text:string,names?:readonly string[]):StreetHit[]{
  if(!text)return [];
  const lookup=names ? new Set(names.map(fold)) : streets;
  if(!lookup.size)return [];
  const words=[...text.matchAll(word)];
  const out:StreetHit[]=[];
  for(let i=0;i<words.length;i++){
    const first=words[i],start=first.index;
    if(start===undefined || !/^\p{Lu}/u.test(first[0]))continue;
    let end=start;
    for(let j=i;j<Math.min(i+5,words.length);j++){
      const part=words[j];
      if(part.index===undefined)break;
      if(j>i && !/^[\s-]+$/u.test(text.slice(end,part.index)))break;
      end=part.index+part[0].length;
      if(!lookup.has(fold(text.slice(start,end))))continue;
      const house=HOUSE.exec(text.slice(end,end+16));
      const hasNumber=!!house;
      const contextual=locationHint.test(text.slice(Math.max(0,start-50),start));
      if(!hasNumber&&!contextual)continue;
      const finalEnd=end+(house?.[0].length??0);
      out.push({start,end:finalEnd,text:text.slice(start,finalEnd),hasNumber});
    }
  }
  return out;
}
