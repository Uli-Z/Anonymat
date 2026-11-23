import { overlaps, sameTerm, type Finding } from './detect-types';
import { replacementKey, type ReplacementRule } from './replacement-strategies';
import { supportsSynthetic } from './synthetic';

export function findingsWithinSelection(findings:readonly Finding[],from:number,to:number):Finding[]{
  if(to<=from)return [];
  return findings.filter(hit=>hit.start>=from && hit.end<=to && hit.end>hit.start)
    .sort((a,b)=>a.start-b.start || a.end-b.end);
}
export type BulkAction='mask'|'exclude';
export type BulkMode='default'|'token'|'synthetic';
export interface BatchState{
  manual:readonly Finding[];
  ignoredPlaces:readonly Finding[];
  ignoredTerms:readonly string[];
  replacementRules:Readonly<Record<string,ReplacementRule>>;
  manualCounter:number;
  exclusionCounter:number;
}
export interface BatchResult{
  manual:Finding[];
  ignoredPlaces:Finding[];
  ignoredTerms:string[];
  replacementRules:Record<string,ReplacementRule>;
  manualCounter:number;
  exclusionCounter:number;
  learned:Pick<Finding,'text'|'kind'>[];
}
/** A batch changes listed findings, never the arbitrary surrounding selection. */
export function applyFindingsBatch(
  selected:readonly Finding[],action:BulkAction,mode:BulkMode,state:BatchState
):BatchResult{
  let manualCounter=state.manualCounter;
  let exclusionCounter=state.exclusionCounter;
  if(action==='exclude'){
    const ignoredPlaces=[...state.ignoredPlaces];
    for(const hit of selected){
      if(!ignoredPlaces.some(place=>overlaps(place,hit))){
        ignoredPlaces.push({...hit,id:'ignored-'+(++exclusionCounter)});
      }
    }
    return {
      manual:[...state.manual],ignoredPlaces,ignoredTerms:[...state.ignoredTerms],
      replacementRules:{...state.replacementRules},manualCounter,exclusionCounter,learned:[]
    };
  }
  const added:Finding[]=selected.filter(hit=>hit.confidence==='review').map(hit=>({
    id:'manual-'+(++manualCounter),kind:hit.kind,text:hit.text,
    start:hit.start,end:hit.end,origin:'manual' as const
  }));
  const replacementRules={...state.replacementRules};
  for(const hit of selected){
    const key=replacementKey(hit.kind,hit.text);
    if(mode==='default')delete replacementRules[key];
    else if(mode==='synthetic' && supportsSynthetic(hit.kind))
      replacementRules[key]={mode:'synthetic',kind:hit.kind};
    else replacementRules[key]={mode:'token',kind:hit.kind};
  }
  return {
    manual:[...state.manual.filter(hit=>!added.some(anchor=>overlaps(hit,anchor))),...added],
    ignoredPlaces:state.ignoredPlaces.filter(place=>!selected.some(hit=>overlaps(place,hit))),
    ignoredTerms:state.ignoredTerms.filter(term=>!selected.some(hit=>sameTerm(term,hit.text))),
    replacementRules,manualCounter,exclusionCounter,
    learned:added.map(hit=>({text:hit.text,kind:hit.kind}))
  };
}
