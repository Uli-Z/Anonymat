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
'straße straßenname haus nummer zimmer pflege krankenpflege rettungsdienst aufnahme entlassung übergabe rücksprache rückruf kontrolle visite sprechstunde anamnese allergie allergien verlauf empfehlung empfehlungen notfall befunde ergebnisse mitarbeiter team kontakt information termin termine dokument dokumentation heute gestern morgen guten gute sehr geehrte geehrter vielen dank bitte hallo herr herrn herren frau fräulein familie dr prof oa oä pd med pat name vorname nachname').split(/\s+/u));

// These spellings can genuinely be surnames, but also occur as ordinary
// nouns/adjectives. An explicit title wins; dictionary evidence alone does not.
const ambiguousNames = new Set(('bauer berger bergmann braun fischer fuchs kaiser keller klein koch könig lange schwarz weiß weiss wolf richter schuster schreiber wagner winter sommer rosa mai stern stein buch engel vogel müller').split(/\s+/u));
const strongPersonalVerb = /^\s+(?:sagte|berichtete|erzählte|erklärte|fragte|antwortete|schrieb|bestätigte|rief|unterschrieb|sprach|meldete)\b/iu;
const blockedName = (value:string):boolean => nonPersonWords.has(fold(value));
const horizontal = String.raw`[\t \u00a0\u202f]`;
const nameWord = String.raw`\p{Lu}[\p{L}\p{M}'’-]+`;
const namePart = String.raw`(?:(?:von|van|de|zu|del|da|di)(?:${horizontal}+(?:der|den|dem|la|le))?${horizontal}+)?${nameWord}`;

export const bundledGivenNameCount=givenNames.length;
export const bundledFamilyNameCount=familyNames.length;

// One title grammar handles ordinary, abbreviated, chained and glued forms.
const title = String.raw`(?:Herr(?:n|en)?|Frau|Fräulein|Familie|Patient(?:in|en)?|Pat\.|Hr\.?|Fr\.?|Dr\.|Prof\.|PD|OA\.?|OÄ\.?)`;
const separator = String.raw`(?:${horizontal}*:${horizontal}*|${horizontal}+|(?=\p{Lu}))`;
const academicTitle = String.raw`(?:Dr\.|Prof\.|PD|med\.|dent\.|OA\.?|OÄ\.?)`;
const salutation = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}_])(${title}${separator}(?:${academicTitle}${horizontal}*)*)(${namePart})(?:(${horizontal}+)(${namePart}))?`, 'gu');
const labeledName = new RegExp(String.raw`\b(Name|Kontaktperson|Ansprechpartner(?:in)?|Unterschrift von|Patientenname|Vorname|Nachname|Familienname)${horizontal}*[:=]${horizontal}*(${nameWord})(?:(${horizontal}+)(${namePart}))?`, 'gu');
// Lookahead permits overlapping pairs: "Heute Anna Müller" must still scan Anna Müller.
const twoNames = new RegExp(String.raw`(?<![\p{L}\p{M}])(?=(${nameWord})(${horizontal}+)(${namePart})(?![\p{L}\p{M}]))`, 'gu');
const wordPattern = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;
// Strong semantic cues permit novel international spellings without relying on
// a surname dictionary or prompting on every capitalized ordinary word.
const explicitlyNamed = new RegExp(String.raw`\b(?:Patient(?:in|en)?|Betroffene|Kind|Anrufer(?:in)?)${horizontal}+(?:heißt|heisst|namens)${horizontal}+(${nameWord})(?:(${horizontal}+)(${namePart}))?(?![\p{L}\p{M}])`, 'gu');
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
    const [,prefix,first,space,second]=match;
    if(blockedName(first))continue;
    const internationalInitial=second && [...first+second].some(c=>/\p{Lu}/u.test(c) && !/[A-ZÄÖÜ]/u.test(c));
    const compoundGiven=first.includes('-') && second && surnames.has(fold(second));
    const secondIsName=second && !blockedName(second) && (
      firstNames.has(fold(first))||compoundGiven||internationalInitial
      ||(!surnames.has(fold(first)) && surnames.has(fold(second)))
      || /^(?:von|van|de|zu|del|da|di)\s/u.test(second));
    const name=secondIsName?first+space+second:first;
    add(name,match.index+prefix.length);
  }
  for(const match of text.matchAll(explicitlyNamed)){
    const [,first,space,second]=match;
    if(blockedName(first))continue;
    const name=second&&!blockedName(second)?first+space+second:first;
    const offset=match[0].length-first.length-(second?space.length+second.length:0);
    add(name,match.index+offset);
  }
  // Only strong conversational grammar supports automatic masking of lowercase
  // given names; a lowercase token alone remains unclassified.
  for(const match of text.matchAll(lowercaseConversation)){
    if(match.index===undefined || !frequentFirst.has(fold(match[1])))continue;
    add(match[1],match.index+match[0].indexOf(match[1]),'FIRST_NAME');
  }
  for(const match of text.matchAll(labeledName)){
    const [,rawLabel,first,space,second]=match;
    const label=fold(rawLabel);
    const single=label==='vorname'||label==='nachname'||label==='familienname';
    const honorific=/^(?:Herrn?|Frau|Hr|Fr)$/iu.test(first);
    const offset=match[0].length-first.length-(second?space.length+second.length:0);
    if(honorific && second && !single && !blockedName(second)){
      add(second,match.index+offset+first.length+space.length);
    }else if(!blockedName(first)){
      const name=first+(!single&&second&&!blockedName(second)?space+second:'');
      add(name,match.index+offset,
        label==='vorname'?'FIRST_NAME':label==='nachname'||label==='familienname'?'LAST_NAME':'PERSON');
    }
  }
  for(const match of text.matchAll(twoNames)){
    const [,first,space,second]=match;
    if(blockedName(first)||blockedName(second))continue;
    const name=first+space+second;
    const before=text.slice(Math.max(0,match.index-70),match.index);
    const after=text.slice(match.index+name.length,match.index+name.length+70);
    const contextual=explicitPersonBefore.test(before)||strongPersonalVerb.test(after);
    if(firstNames.has(fold(first)) && surnames.has(fold(second))){
      // Two common dictionary words are not sufficient evidence of a person.
      if(contextual||frequentFirst.has(fold(first))||frequentLast.has(fold(second))){
        if(!contextual && ambiguousNames.has(fold(first)) && ambiguousNames.has(fold(second)))continue;
        add(name,match.index);
      }else if(!articleBefore.test(before) && !ambiguousNames.has(fold(first)) && !ambiguousNames.has(fold(second))){
        hits.push({start:match.index,text:name,kind:'PERSON',confidence:'review'});
      }
    }else if(surnames.has(fold(second)) && looksLikeGivenNameTypo(first)){
      if(contextual || personalVerbAfter.test(after))
        add(name,match.index);
    }
  }
  for(const match of findTerms(text,[...learned])){
    if(blockedName(match.text))continue;
    const before=text.slice(Math.max(0,match.start-70),match.start);
    const after=text.slice(match.end,match.end+70);
    if(ambiguousNames.has(fold(match.text)) && !explicitPersonBefore.test(before)
      && !strongPersonalVerb.test(after) && (!/^\p{Lu}/u.test(match.text)||articleBefore.test(before)))continue;
    hits.push({start:match.start,text:match.text,kind:'PERSON',confidence:'certain'});
  }

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
    if(ambiguousNames.has(key) && !personCue && !strongPersonalVerb.test(after))continue;
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
