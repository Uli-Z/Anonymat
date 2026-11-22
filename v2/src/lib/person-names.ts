import { findTerms } from './term-index';
import givenNames from '../data/given-names.json';
import familyNames from '../data/family-names.json';

export interface NameHit {
  start:number;
  text:string;
  kind:'PERSON'|'FIRST_NAME'|'LAST_NAME';
  confidence:'certain'|'probable'|'review';
}

const fold=(value:string)=>value.normalize('NFC').toLocaleLowerCase('de');
const trustedGiven = ('Anna Ali Alexander Alexandra Amelie Amir Anja Anton Antonio Ayşe Benjamin Bernd Birgit '+
'Carla Charlotte Clara Christian Christina Christoph Daniel Daniela David Derya Dilara Elena Elias Elisabeth '+
'Emil Emilia Emma Erik Eva Fatima Felix Finn Florian Franz Friedrich Friedrich-Gustav Hannah Hans Hasan '+
'Helena Ibrahim Ida Ilse Ingrid Isabel Isabella Jakob Jan Jana Jasmin Jens Johann Johannes Jonas '+
'Josef Julia Julian Karl Katharina Kerem Kevin Lara Laura Lea Lena Leon Leonie Lina Lisa Lukas '+
'Luisa Luis Maja Manfred Maria Marie Markus Martin Matthias Max Mehmet Michael Mila Miriam Mohammed '+
'Mohammad Moritz Murat Mustafa Nadine Natalia Nele Nils Nina Noah Oliver Olivia Omar Paul Paula '+
'Peter Petra Philipp Pia Rafael Rebecca Robert Rosa Sabine Sarah Sebastian Selin Selma Simon Sofia '+
'Sophie Stefan Stefanie Susanne Thomas Tim Tobias Ulrich Uwe Viktor Vincent Walter Yasmin Yılmaz Yusuf '+
'Zeynep Zoe').split(/\s+/u);
const trustedFamily = ('Bauer Becker Berger Bergmann Braun Fischer Fuchs Hoffmann Hofmann Kaiser Keller '+
'Klein Koch Krüger Lange Lehmann Maier Mayer Meier Meyer Möller Müller Neumann Peters Richter Roth '+
'Schäfer Schmid Schmidt Schneider Schulz Schulte Schwarz Schuster Schröder Schreiber Wagner Weber '+
'Werner Wolf Zimmermann Mustermann Yılmaz Özdemir Kaya Demir Yildiz Hoffmanns Bismarck').split(/\s+/u);

const firstNames = new Set([...givenNames,...trustedGiven].map(fold));
const surnames = new Set([...familyNames,...trustedFamily].map(fold));
const frequentFirst = new Set(trustedGiven.map(fold));
const frequentLast = new Set(trustedFamily.map(fold));

// Strong negative evidence: a clinical/institutional term must not turn into a
// name merely because a large multinational surname lexicon contains it.
const nonPersonWords = new Set(('krankenhaus klinik klinikum arztpraxis praxis patient patientin '+
'patienten station notaufnahme intensivstation op operation behandlung therapie '+
'untersuchung befund diagnose medikament labor bericht brief adresse iban bic swift plz '+
'straße straßenname haus nummer zimmer pflege krankenpflege rettungsdienst').split(/\s+/u));

export const bundledGivenNameCount=givenNames.length;
export const bundledFamilyNameCount=familyNames.length;

const salutation = /\b(?:Herr(?:n|en)?|Frau|Hr\.?|Fr\.?|Fräulein|Familie|Patient(?:in|en)?|Dr\.|Prof\.)\s+(?:(?:Dr\.\s*(?:med\.\s*)?|Prof\.\s*|PD\s+Dr\.\s*)*)(?:([\p{Lu}][\p{L}\p{M}'’-]+|(?:von|van|de|zu)\s+[\p{Lu}][\p{L}\p{M}'’-]+)(?:\s+([\p{Lu}][\p{L}\p{M}'’-]+))?)/gu;
// Typical dictation typo: "HerrnMüller" / "FrauSchmidt".
const gluedSalutation = /(?<![\p{L}\p{M}])(?:Herrn|Herr|Frau|Fr\.|Hr\.|Dr\.|Prof\.)(?=([A-ZÄÖÜ][\p{L}\p{M}'’-]{2,}))/gu;
const labeledName = /\b(Name|Kontaktperson|Ansprechpartner(?:in)?|Unterschrift von|Patientenname|Vorname|Nachname|Familienname)\s*[:=]\s*([A-ZÄÖÜ][\p{L}\p{M}'’-]+)(?:\s+([A-ZÄÖÜ][\p{L}\p{M}'’-]+))?/gu;
const twoNames = /(?<![\p{L}\p{M}])([\p{Lu}][\p{L}\p{M}'’-]+)\s+([\p{Lu}][\p{L}\p{M}'’-]+)(?![\p{L}\p{M}])/gu;
const wordPattern = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;
// Strong semantic cues permit novel international spellings without relying on
// a surname dictionary or prompting on every capitalized ordinary word.
const explicitlyNamed = /\b(?:Patient(?:in|en)?|Betroffene|Kind|Anrufer(?:in)?)\s+(?:heißt|heisst|namens)\s+([\p{Lu}][\p{L}\p{M}'’-]+)\s+([\p{Lu}][\p{L}\p{M}'’-]+)(?![\p{L}\p{M}])/gu;
const lowercaseConversation = /\b(?:mit|von|für|bei)\s+([\p{Ll}][\p{Ll}\p{M}'’-]{2,})\s+(?:gesprochen|telefoniert|geschrieben|gechattet|verabredet)\b/giu;
const articleBefore = /\b(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|im|ins|am|beim|zum|zur)\s+$/iu;
const personalBefore = /\b(?:mit|von|für|bei|an|zu|durch|gegen|über|mein|meine|unser|unsere|seine|ihre)\s+$/iu;
const explicitPersonBefore = /\b(?:herr|frau|patient|patientin|kollege|kollegin|arzt|ärztin|professor|professorin|kontaktperson)\s+$/iu;
const personalVerbAfter = /^\s+(?:sagte|berichtete|erzählte|erklärte|fragte|antwortete|schrieb|bestätigte|rief|kam|ging|hat|hatte|war|wurde|ist|bleibt|möchte|will|kann|soll|sprach|erhielt|erhält|besuchte|unterschrieb|arbeitet|lebt|wohnt)\b/iu;

function oneEditApart(a:string,b:string):boolean {
  if(a===b || Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,edits=0;
  while(i<a.length && j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(a.length>b.length)i++;
    else if(b.length>a.length)j++;
    else{i++;j++;}
  }
  return edits+(a.length-i)+(b.length-j)===1;
}
function looksLikeGivenNameTypo(value:string):boolean {
  const key=fold(value);
  return key.length>=4 && [...frequentFirst].some(name=>oneEditApart(key,name));
}
function stemSurname(value:string):string {
  if(value.endsWith("'s") || value.endsWith('’s'))return value.slice(0,-2);
  if(value.endsWith('s') && value.length>4 && surnames.has(fold(value.slice(0,-1))))return value.slice(0,-1);
  return value;
}
function variants(value:string):string[]{
  const parts=value.trim().split(/\s+/u);
  const last=parts.at(-1)!;
  const base=stemSurname(last);
  const forms=[value,last];
  if(parts.length>1 && firstNames.has(fold(parts[0])))forms.push(parts[0]);
  if(base.length>2 && !/[sxzß]$/iu.test(base)){
    forms.push(base,base+'s',base+"'s",base+'’s');
  }else forms.push(base);
  return forms;
}

/**
 * Contextual names are accepted. High-frequency standalone names may be
 * accepted with evidence of a person in the sentence. Isolated or broadly
 * ambiguous dictionary matches are review-only suggestions, never auto-masked.
 * All lookups are offline hash-set checks; no regex per dictionary entry.
 */
export function scanPersonNames(text:string):NameHit[]{
  const hits:NameHit[]=[];
  const learned=new Set<string>();
  const add=(value:string,start:number,kind:NameHit['kind']='PERSON'):void=>{
    hits.push({start,text:value,kind,confidence:'certain'});
    for(const form of variants(value))if(form.length>2)learned.add(form);
  };
  for(const match of text.matchAll(salutation)){
    const first=match[1],second=match[2];
    if(match.index===undefined || !first)continue;
    const internationalInitial=second && [...first+second].some(c=>/\p{Lu}/u.test(c) && !/[A-ZÄÖÜ]/u.test(c));
    const compoundGiven=first.includes('-') && second && surnames.has(fold(second));
    const name=second && (firstNames.has(fold(first))||compoundGiven||internationalInitial)?first+' '+second:first;
    add(name,match.index+match[0].lastIndexOf(name));
  }
  for(const match of text.matchAll(explicitlyNamed)){
    if(match.index===undefined)continue;
    const name=match[1]+' '+match[2];
    add(name,match.index+match[0].lastIndexOf(name));
  }
  // Only strong conversational grammar supports automatic masking of lowercase
  // given names; a lowercase token alone remains unclassified.
  for(const match of text.matchAll(lowercaseConversation)){
    if(match.index===undefined || !frequentFirst.has(fold(match[1])))continue;
    add(match[1],match.index+match[0].indexOf(match[1]),'FIRST_NAME');
  }
  for(const match of text.matchAll(gluedSalutation)){
    if(match.index===undefined || !match[1])continue;
    if(surnames.has(fold(match[1])) || firstNames.has(fold(match[1])))
      add(match[1],match.index+match[0].length);
  }
  for(const match of text.matchAll(labeledName)){
    const first=match[2],second=match[3];
    if(match.index===undefined || !first)continue;
    const label=fold(match[1]);
    const single=label==='vorname'||label==='nachname'||label==='familienname';
    const honorific=/^(?:Herrn?|Frau|Hr|Fr)$/iu.test(first);
    const name=honorific && second && !single ? second : first+(!single&&second?' '+second:'');
    add(name,match.index+match[0].lastIndexOf(name),
      label==='vorname'?'FIRST_NAME':label==='nachname'||label==='familienname'?'LAST_NAME':'PERSON');
  }
  for(const match of text.matchAll(twoNames)){
    if(match.index===undefined)continue;
    // A global dictionary can contain technical acronyms as apparent names.
    // Never let e.g. "IBAN DE..." become a learned person's name.
    if(nonPersonWords.has(fold(match[1])) || nonPersonWords.has(fold(match[2])))continue;
    if(firstNames.has(fold(match[1])) && surnames.has(fold(match[2])))
      add(match[0],match.index);
    else if(surnames.has(fold(match[2])) && looksLikeGivenNameTypo(match[1])){
      const before=text.slice(Math.max(0,match.index-70),match.index);
      const after=text.slice(match.index+match[0].length,match.index+match[0].length+70);
      if(explicitPersonBefore.test(before) || personalVerbAfter.test(after) || /^\s+meldete\b/iu.test(after))
        add(match[0],match.index);
    }
  }
  for(const match of findTerms(text,[...learned]))
    hits.push({start:match.start,text:match.text,kind:'PERSON',confidence:'certain'});

  // Skip tokens already covered by a stronger contextual or learned match.
  const covered=hits.map(hit=>({start:hit.start,end:hit.start+hit.text.length}))
    .sort((a,b)=>a.start-b.start);
  let coveredIndex=0;
  for(const match of text.matchAll(wordPattern)){
    const start=match.index;
    if(start===undefined)continue;
    const name=match[0],end=start+name.length;
    if(!/^\p{Lu}/u.test(name) || name.length<3)continue;
    while(coveredIndex<covered.length && covered[coveredIndex].end<=start)coveredIndex++;
    if(coveredIndex<covered.length && covered[coveredIndex].start<end)continue;
    const key=fold(name);
    if(nonPersonWords.has(key))continue;
    const first=firstNames.has(key),last=surnames.has(key);
    if(!first&&!last)continue;
    const before=text.slice(Math.max(0,start-70),start);
    const after=text.slice(end,end+70);
    if(articleBefore.test(before))continue;
    const personCue=explicitPersonBefore.test(before);
    const verbCue=personalVerbAfter.test(after);
    const prepositionCue=personalBefore.test(before);
    const frequentGiven=first && frequentFirst.has(key);
    const frequentSurname=last && frequentLast.has(key);
    // "Peter berichtete", "mit Ulrich", "Müller antwortete":
    // recognizable with person-specific context, without masking common nouns.
    const probable=(frequentGiven && (personCue||verbCue||prepositionCue))
      || (frequentSurname && (personCue||verbCue));
    const suggest=probable || frequentGiven || frequentSurname
      || (first && (personCue||verbCue||prepositionCue))
      || (last && personCue);
    if(!suggest)continue;
    hits.push({start,text:name,kind:first?'FIRST_NAME':'LAST_NAME',
      confidence:probable?'probable':'review'});
  }
  return hits;
}
