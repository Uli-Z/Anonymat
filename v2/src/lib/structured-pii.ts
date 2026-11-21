import type { Kind } from './detect';

export interface StructuredHit {kind:Kind;start:number;text:string}
const STREET = /(?<![\p{L}\p{N}])(?:[A-ZÄÖÜ][\p{L}\p{M}ßäöü'-]{1,50}(?:[- ](?:[A-ZÄÖÜ][\p{L}\p{M}ßäöü'-]{1,50}|der|den|dem|am|an|zur|zum)){0,3}[- ]?)(?:[Ss]traße|[Ss]trasse|[Ss]tr\.|[Ww]eg|[Aa]llee|[Gg]asse|[Pp]latz|[Rr]ing|[Dd]amm|[Uu]fer|[Cc]haussee|[Ss]tieg|[Pp]fad|[Pp]romenade)(?:\s+\d{1,4}[a-zA-Z]?(?:[-/]\d{1,4}[a-zA-Z]?)?)?/gu;
const NAMED_STREET = /(?<![\p{L}\p{N}])(?:Am|An|Im|Auf|Bei|Unter|Vor|Hinter|Zum|Zur)\s+(?:(?:der|den|dem|alten|neuen)\s+)?[A-ZÄÖÜ][\p{L}\p{M}ßäöü'-]{2,55}(?:\s+[A-ZÄÖÜ][\p{L}\p{M}ßäöü'-]{2,55})?\s+\d{1,4}[a-zA-Z]?/gu;
const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,24}(?![\p{L}\p{N}-])/gu;
const PHONE = /(?<![\p{L}\p{N}])(?:\+\d{1,3}|00\d{1,3}|0[1-9])(?:[\s()./-]*\d){6,14}(?!\d)/gu;
const IBAN = /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}(?![\p{L}\p{N}])/giu;
const URL = /(?<![\p{L}\p{N}@])(?:https?:\/\/|www\.)[^\s<>"'()[\]{}]+/giu;
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gu;
const POSTCODE = /(?<![\d])(?:D[-\s]?)?\d{5}(?!\d)/giu;
const BIC = /\b(?:BIC|SWIFT(?:-Code)?)\s*[:#]?\s*([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/giu;
const IDENTIFIER = /\b(?:Patienten(?:-?ID|-?Nr\.?|-?nummer)?|Patientenakte|Fall(?:nummer|-?ID)|Aktenzeichen|AZ|KVNR|Versichertennummer|Krankenversichertennummer|Steuer(?:-?ID|identifikationsnummer|nummer)|USt-?IdNr\.?|Personalnummer|Kundennummer|Rechnungsnummer|Bestellnummer|Ausweisnummer|Passnummer|Seriennummer|Fahrgestellnummer|FIN|VIN|Geburtsregisternummer|Vorgangsnummer|ID)\s*(?:[:=#]|\bNr\.?)?\s*([A-Z0-9][A-Z0-9./_-]{3,35})/giu;
const PLATE = /\b(?:Kennzeichen|Kfz[- ]?Kennzeichen|Nummernschild)\s*[:#]?\s*([A-ZÄÖÜ]{1,3}[-\s]+[A-Z]{1,2}[-\s]+\d{1,4}[EH]?)\b/giu;
const TIME = /(?:(?:\bum|\bgegen|\bUhrzeit\s*:?)\s*)(\d{1,2}:\d{2})(?=\s*(?:Uhr\b|[,.;]|$))/giu;

function checkIban(value:string):boolean {
  const compact=value.replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact))return false;
  const moved=compact.slice(4)+compact.slice(0,4);
  let remainder=0;
  for(const char of moved){
    const digits=char>='A'&&char<='Z'?String(char.charCodeAt(0)-55):char;
    for(const digit of digits)remainder=(remainder*10+Number(digit))%97;
  }
  return remainder===1;
}

function matchGroup(match:RegExpMatchArray,group:number):{start:number;text:string}|null{
  const text=match[group];
  if(!text || match.index===undefined)return null;
  return {start:match.index+match[0].indexOf(text),text};
}

export function scanStructuredPII(text:string):StructuredHit[]{
  const hits:StructuredHit[]=[];
  const push=(kind:Kind,start:number,value:string):void=>{
    if(value)hits.push({kind,start,text:value});
  };
  for(const match of text.matchAll(EMAIL))push('EMAIL',match.index,match[0]);
  for(const match of text.matchAll(URL))push('URL',match.index,match[0].replace(/[.,;:!?]+$/u,''));
  for(const match of text.matchAll(PHONE)){
    const digits=match[0].replace(/\D/g,'');
    if(digits.length>=8 && digits.length<=15 && !/^\d{4}[-/]\d{2}[-/]\d{2}/.test(match[0]))
      push('PHONE',match.index,match[0].trimEnd());
  }
  for(const match of text.matchAll(IBAN))if(checkIban(match[0]))push('IBAN',match.index,match[0]);
  for(const match of text.matchAll(IPV4)){
    if(match[0].split('.').every(piece=>Number(piece)<=255))push('IP',match.index,match[0]);
  }
  for(const match of text.matchAll(BIC)){
    const group=matchGroup(match,1);
    if(group)push('BIC',group.start,group.text);
  }
  for(const match of text.matchAll(IDENTIFIER)){
    const group=matchGroup(match,1);
    if(group && /[\d]/.test(group.text) && !/^\d{4}$/.test(group.text))
      push('ID',group.start,group.text);
  }
  for(const match of text.matchAll(PLATE)){
    const group=matchGroup(match,1);
    if(group)push('LICENSE_PLATE',group.start,group.text);
  }
  for(const match of text.matchAll(STREET)){
    if(!/^\p{Lu}/u.test(match[0]))continue;
    push(/\d{1,4}[a-zA-Z]?(?:[-/]\d{1,4}[a-zA-Z]?)?$/u.test(match[0])?'ADDRESS':'STREET',match.index,match[0]);
  }
  for(const match of text.matchAll(NAMED_STREET))push('ADDRESS',match.index,match[0]);
  for(const match of text.matchAll(POSTCODE)){
    const before=text.slice(Math.max(0,match.index-25),match.index);
    const after=text.slice(match.index+match[0].length,match.index+match[0].length+36);
    if(/\b(?:PLZ|Postleitzahl|postcode|postal code)\s*[:#]?\s*$/iu.test(before)
       || /^\s+[A-ZÄÖÜ][\p{L}\p{M}ßäöü-]{2,}(?:\s+[A-ZÄÖÜ][\p{L}\p{M}ßäöü-]{2,})?/u.test(after))
      push('POSTAL_CODE',match.index,match[0]);
  }
  for(const match of text.matchAll(TIME)){
    const group=matchGroup(match,1);
    if(group){
      const [hour,minute]=group.text.split(':').map(Number);
      if(hour<=23 && minute<=59)push('TIME',group.start,group.text);
    }
  }
  return hits;
}
