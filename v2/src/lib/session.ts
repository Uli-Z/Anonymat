import type { NumericDateOrder } from './dates';
import { scanDocument, overlaps, type Finding, type Kind } from './detect';
import type { LearnedRule } from './learned-rules';

export interface TermGroup {
  key: string;
  text: string;
  kind: Kind;
  count: number;
  activeCount: number;
  manual: boolean;
  learned: boolean;
  review: boolean;
}
export interface ReviewedDocument {
  findings: Finding[];
  active: Finding[];
  pending: Finding[];
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
  enableCities = true,
  learnedRules: readonly LearnedRule[] = []
): ReviewedDocument {
  const findings = scanDocument(source, manualAnchors, numericOrder, enableCities, learnedRules);
  const excluded=new Set(ignoredTerms.map(term=>term.normalize('NFC').toLocaleLowerCase('de')));
  const active = findings.filter(hit =>
    (hit.origin==='manual' || hit.confidence!=='review')
    && !excluded.has(hit.text.normalize('NFC').toLocaleLowerCase('de'))
    && !ignoredPlaces.some(place => overlaps(place, hit))
  );
  const activeIds = new Set(active.map(hit=>hit.id));
  const pending=findings.filter(hit=>hit.confidence==='review' && !activeIds.has(hit.id)
    && !excluded.has(hit.text.normalize('NFC').toLocaleLowerCase('de'))
    && !ignoredPlaces.some(place=>overlaps(place,hit)));
  const map = new Map<string,TermGroup>();
  for(const hit of findings){
    const key=hit.kind+':'+hit.text.normalize('NFC').toLocaleLowerCase('de');
    let group=map.get(key);
    if(!group){
      group={key,text:hit.text,kind:hit.kind,count:0,activeCount:0,manual:false,learned:false,review:false};
      map.set(key,group);
    }
    group.count++;
    if(activeIds.has(hit.id))group.activeCount++;
    if(hit.origin==='manual')group.manual=true;
    if(hit.origin==='learned')group.learned=true;
    if(hit.confidence==='review')group.review=true;
  }
  return {findings,active,pending,groups:[...map.values()]};
}
