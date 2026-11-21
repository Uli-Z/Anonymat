import type { NumericDateOrder } from './dates';
import { scanDocument, overlaps, type Finding, type Kind } from './detect';

export interface TermGroup {
  key: string;
  text: string;
  kind: Kind;
  count: number;
  activeCount: number;
  manual: boolean;
}
export interface ReviewedDocument {
  findings: Finding[];
  active: Finding[];
  groups: TermGroup[];
}
/**
 * Exclusions are decisions, NOT detections. A locally ignored mark remains
 * anchored in the document and a globally ignored term affects all occurrences.
 */
export function reviewDocument(
  source: string,
  manualAnchors: readonly Finding[],
  ignoredPlaces: readonly Finding[],
  ignoredTerms: readonly string[],
  numericOrder: NumericDateOrder = 'auto',
  enableCities = true
): ReviewedDocument {
  const findings = scanDocument(source, manualAnchors, numericOrder, enableCities);
  const excluded=new Set(ignoredTerms.map(term=>term.normalize('NFC').toLocaleLowerCase('de')));
  const active = findings.filter(hit =>
    !excluded.has(hit.text.normalize('NFC').toLocaleLowerCase('de'))
    && !ignoredPlaces.some(place => overlaps(place, hit))
  );
  const activeIds = new Set(active.map(hit=>hit.id));
  const map = new Map<string,TermGroup>();
  for(const hit of findings){
    const key=hit.kind+':'+hit.text.normalize('NFC').toLocaleLowerCase('de');
    let group=map.get(key);
    if(!group){
      group={key,text:hit.text,kind:hit.kind,count:0,activeCount:0,manual:false};
      map.set(key,group);
    }
    group.count++;
    if(activeIds.has(hit.id))group.activeCount++;
    if(hit.origin==='manual')group.manual=true;
  }
  return {findings,active,groups:[...map.values()]};
}
