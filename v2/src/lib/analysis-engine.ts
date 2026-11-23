import { reviewDocument } from './session';
import { maskText } from './replace';
import type { AnalysisRequest } from './analysis-protocol';

export function analyze(request:AnalysisRequest,progress?:(stage:'detect'|'replace',completed:number)=>void){
  const start=performance.now();
  progress?.('detect',20);
  const reviewed=reviewDocument(
    request.text,request.manual,request.ignoredPlaces,request.ignoredTerms,
    request.numericOrder,request.cityLexiconEnabled,request.learned ?? []
  );
  progress?.('replace',75);
  const prepared=maskText(request.text,reviewed.active,request.rules,request.dateOptions);
  return {reviewed,prepared,elapsedMs:performance.now()-start};
}
