/** General number recognition. The value is replaced, not the unit/currency. */
export interface NumberHit {start:number;end:number;text:string}
const NUMERIC = /(?<![\p{L}\p{N}_])[-+−]?(?:\d{1,3}(?:[ .]\d{3})+(?:[,.]\d+)?|\d+(?:[,.]\d+)*)(?!\d)/gu;
// Allow common attached units, but not arbitrary identifier suffixes.
// SI symbols are case-sensitive; spelled-out units are case-insensitive.
const UNIT_SYMBOL = /^(?:kg|mg|[µμu]g|ng|pg|g|t|km|cm|mm|[µμu]m|nm|m|(?:m|cm|mm|km)[²³23]|mL|ml|dL|dl|cL|cl|L|l|[µμu][Ll]|mol|mmol|[µμu]mol|nmol|pmol|mmHg|kPa|hPa|Pa|bar|mbar|Hz|kHz|MHz|GHz|kcal|cal|kJ|J|kWh|Wh|kW|W|mW|MW|mV|kV|V|mA|A|Ah|mAh|s|ms|[µμu]s|min|h|d|bpm|rpm|IU|IE|U|[GT]\/[Ll]|GB|MB|KB|TB|KiB|MiB|GiB|EUR|USD|GBP|CHF)(?![\p{L}\p{M}\p{N}_])/u;
const UNIT_WORD = /^(?:euro|cent|kilogramm|kilo|gramm|milligramm|mikrogramm|tonnen?|kilometer|zentimeter|centimeter|millimeter|meter|liter|milliliter|sekunden?|minuten?|stunden?|tage?|wochen?|monate?|jahre?|prozent|dollar|pounds?|inches|feet|kilograms?|grams?|meters?|liters?|seconds?|minutes?|hours?|days?|years?)(?![\p{L}\p{M}\p{N}_])/iu;
function hasValidEnd(source:string,end:number):boolean {
  const tail=source.slice(end,end+32);
  return !/^[\p{L}\p{M}\p{N}_]/u.test(tail) || UNIT_SYMBOL.test(tail) || UNIT_WORD.test(tail);
}

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
    // Match the full numeric token before checking its suffix; otherwise
    // regex backtracking could mask only the integer part of a decimal.
    if(!hasValidEnd(source,end))continue;
    if(start>=2 && /\d[,.]$/u.test(source.slice(start-2,start)))continue;
    if(isListNumber(source,start,end,match[0]))continue;
    // Isolated digits are normally structural or non-identifying.
    if(/^[-+−]?[0-9]$/u.test(match[0]))continue;
    // "AB-123" is a code, not an independent number.
    if(start>1 && source[start-1]==='-' && /[\p{L}_]/u.test(source[start-2]))continue;
    result.push({start,end,text:match[0]});
  }
  return result;
}
