import type { Kind } from './detect-types';

export interface ContextMarkerHit {
  kind: Kind;
  start: number;
  text: string;
  confidence: 'certain' | 'review';
}

// Unicode words, including initials, usernames and hyphenated names.
const BRACKETED = /\[(\p{L}[\p{L}\p{M}\p{N}_'’.-]*)\]/gu;
const SIGNATURE = /(?<![^\s])\/{1,2}[\t ]*(\p{L}[\p{L}\p{M}\p{N}_'’-]*)[\t ]*(?=\r?\n|\r|$)/gu;
const EXISTING_TOKEN = /^\[[A-Z][A-Z0-9_]*_[A-Z0-9_]+\]$/u;

export function scanContextMarkers(source:string):ContextMarkerHit[]{
  const hits:ContextMarkerHit[]=[];
  for(const match of source.matchAll(BRACKETED)){
    // Leave generated and conventional custom placeholders alone.
    if(EXISTING_TOKEN.test(match[0]))continue;
    // Replace the brackets as well, avoiding nested replacement tokens.
    hits.push({kind:'OTHER',start:match.index,text:match[0],confidence:'certain'});
  }
  for(const match of source.matchAll(SIGNATURE)){
    // Keep the signature delimiter and whitespace intact. End of document
    // is treated as a line ending, too. Require whitespace or line start
    // before slash to avoid URL paths, ratios and joined alternatives.
    const value=match[1];
    hits.push({kind:'LAST_NAME',start:match.index+match[0].indexOf(value),text:value,confidence:'review'});
  }
  return hits;
}
