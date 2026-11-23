import type { Kind } from './detect';

export interface StructuredHit {kind:Kind;start:number;text:string}
const STREET = /(?<![\p{L}\p{N}])(?:[A-ZÄÖÜ][\p{L}\p{M}ßäöü'-]{1,50}(?:[- ](?:[A-ZÄÖÜ][\p{L}\p{M}ßäöü'-]{1,50}|der|den|dem|am|an|zur|zum)){0,3}[- ]?)(?:[Ss]traße|[Ss]trasse|[Ss]tr\.|[Ww]eg|[Aa]llee|[Gg]asse|[Pp]latz|[Rr]ing|[Dd]amm|[Uu]fer|[Cc]haussee|[Ss]tieg|[Pp]fad|[Pp]romenade)(?:\s+\d{1,4}[a-zA-Z]?(?:[-/]\d{1,4}[a-zA-Z]?)?|\d{1,3}[a-zA-Z]?(?!\d))?(?![\p{L}\p{M}\p{N}])/gu;
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
const TIME = /(?:(?:(?<!\p{L})um|\bgegen|\bUhrzeit\s*:?)\s*)(\d{1,2}:\d{2})(?=\s*(?:Uhr\b|[,.;]|$))/giu;
const PERIOD_NOT_STREET = /^(?:Am|An|Im|Auf|Bei|Unter|Vor|Hinter|Zum|Zur)\s+(?:Jahr|Monat|Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(?:19|20)\d{2}$/iu;
const GENERIC_PLACE_NOUN = /^(?:Parkplatz|Arbeitsplatz|Spielplatz|Sitzplatz)$/iu;
const BARE_STREET_SUFFIX = /^(?:Weg|Straße|Strasse|Platz|Ring|Allee|Gasse|Damm|Ufer|Chaussee)$/iu;
const GENERIC_NUMBERED_LOCATION = /^(?:Am|An|Im|Auf|Bei|Unter|Vor|Hinter|Zum|Zur)\s+(?:Abschnitt|Kapitel|Raum|Zimmer|Station|Haus|Gebäude|Schritt)\s+\d{1,4}$/iu;

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
    // Never start a telephone number inside a full calendar date.
    if(match.index>0 && /[\d.]/u.test(text[match.index-1]))continue;
    const digits=match[0].replace(/\D/g,'');
    // 04/05/2026 is an ambiguous date, never a telephone number.
    if(/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(match[0]))continue;
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
    if(group){
      // Trailing sentence punctuation is not part of an identifier.
      const value=group.text.replace(/[.,;:]+$/u,'');
      if(/[\d]/.test(value) && !/^\d{4}$/.test(value))push('ID',group.start,value);
    }
  }
  for(const match of text.matchAll(PLATE)){
    const group=matchGroup(match,1);
    if(group)push('LICENSE_PLATE',group.start,group.text);
  }
  for(const match of text.matchAll(STREET)){
    if(!/^\p{Lu}/u.test(match[0]))continue;
    // 'An der Berliner Straße' refers to 'Berliner Straße', not a street
    // named 'An der Berliner Straße'. The latter would need an explicit number.
    const grammatical=/^(?:(?:An|Am|In|Auf|Bei|Unter|Vor|Hinter)\s+(?:der|dem|den)\s+|(?:Der|Die|Das)\s+)/u.exec(match[0]);
    const offset=grammatical?.[0].length??0;
    const value=match[0].slice(offset);
    if(GENERIC_PLACE_NOUN.test(value) || BARE_STREET_SUFFIX.test(value))continue;
    push(/\d{1,4}[a-zA-Z]?(?:[-/]\d{1,4}[a-zA-Z]?)?$/u.test(value)?'ADDRESS':'STREET',match.index+offset,value);
  }
  for(const match of text.matchAll(NAMED_STREET)){
    // Calendar periods are not named streets.
    if(PERIOD_NOT_STREET.test(match[0]))continue;
    const addressContext=text.slice(Math.max(0,match.index-45),match.index);
    if(GENERIC_NUMBERED_LOCATION.test(match[0]) &&
      !/(?:adresse|anschrift)\s*[:=]?\s*$/iu.test(addressContext))continue;
    // General location phrases with a number are not necessarily addresses:
    // "Im Krankenhaus 5" often refers to a ward/building, not a street.
    const prior=text.slice(Math.max(0,match.index-50),match.index);
    const explicitAddress=/(?:^|[^\p{L}])(?:adresse|anschrift|straße|strasse)\s*[:=]?\s*$/iu.test(prior);
    const institution=/(?:^|\s)(?:krankenhaus|klinik|klinikum|station|praxis|notaufnahme|schule|kindergarten|rathaus)\s+\d/iu.test(match[0]);
    if(institution && !explicitAddress)continue;
    push('ADDRESS',match.index,match[0]);
  }
  for(const match of text.matchAll(POSTCODE)){
    const before=text.slice(Math.max(0,match.index-25),match.index);
    const after=text.slice(match.index+match[0].length,match.index+match[0].length+36);
    if(/\b(?:PLZ|Postleitzahl|postcode|postal code)\s*[:#]?\s*$/iu.test(before)
       || /^\s*[A-ZÄÖÜ][\p{Ll}\p{M}ßäöü-]{2,}(?:\s+[A-ZÄÖÜ][\p{L}\p{M}ßäöü-]{2,})?/u.test(after))
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
