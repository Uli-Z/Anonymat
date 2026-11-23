import type { Finding } from './detect';
import type { ReviewedDocument } from './session';
import type { MaskedResult, DateMaskOptions } from './replace';
import type { ReplacementRule } from './replacement-strategies';
import type { LearnedRule } from './learned-rules';
import type { DetectionSettings } from './detect-types';
export interface AnalysisRequest {
  type:'analyze';
  id:number;
  text:string;
  manual:Finding[];
  learned?:LearnedRule[];
  ignoredPlaces:Finding[];
  ignoredTerms:string[];
  numericOrder:'auto'|'DMY'|'MDY';
  cityLexiconEnabled:boolean;
  /** Optional automatic detection categories; manual marks remain explicit. */
  enabledKinds?:DetectionSettings;
  rules:Record<string,ReplacementRule>;
  dateOptions:DateMaskOptions;
}
export type AnalysisMessage =
  | {type:'ready';counts:{cities:number;cityHomonyms:number;first:number;last:number;streets:number}}
  | {type:'stage';id:number;stage:'detect'|'replace';completed:number}
  | {type:'result';id:number;reviewed:ReviewedDocument;prepared:MaskedResult;elapsedMs:number}
  | {type:'error';id:number;message:string};
