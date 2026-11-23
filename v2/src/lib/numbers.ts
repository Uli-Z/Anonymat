/** General number recognition. The value is replaced, not the unit/currency. */
export interface NumberHit {start:number;end:number;text:string}
const NUMERIC = /(?<![\p{L}\p{N}_])[-+−]?(?:\d{1,3}(?:[ .]\d{3})+(?:[,.]\d+)?|\d+(?:[,.]\d+)*)(?![\p{L}\p{N}_])/gu;

function isListNumber(source:string,start:number,end:number,value:string):boolean {
  // List labels ("1. Punkt", " 2) Punkt") are layout, not identifying values.
  if(!/^\d{1,3}$/u.test(value))return false;
  if(!/^[.)]{1,2}(?=\s|$)/u.test(source.slice(end)))return false;
  const before=source.slice(source.lastIndexOf('\n',start-1)+1,start);
  return /^\s*(?:[-*•]\s*|#{1,6}\s*)?$/u.test(before)
    || /(?:^|;)\s*$/u.test(before);
}

export function scanNumbers(source:string):NumberHit[]{
  const result:NumberHit[]=[];
  for(const match of source.matchAll(NUMERIC)){
    const start=match.index,end=start+match[0].length;
    if(isListNumber(source,start,end,match[0]))continue;
    // "AB-123" is a code, not an independent number.
    if(start>1 && source[start-1]==='-' && /[\p{L}_]/u.test(source[start-2]))continue;
    result.push({start,end,text:match[0]});
  }
  return result;
}
