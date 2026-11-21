import { findTerms } from './term-index';

export interface NameHit {start:number;text:string}
const firstNames = new Set(('Anna Ali Alexander Alexandra Amelie Amir Anja Anton Antonio Ayşe Benjamin Bernd Birgit '+
'Carla Charlotte Clara Christian Christina Christoph Daniel Daniela David Derya Dilara Elena Elias Elisabeth '+
'Emil Emilia Emma Erik Eva Fatima Felix Finn Florian Franz Friedrich Friedrich-Gustav Hannah Hans Hasan '+
'Helena Ibrahim Ida Ilse Ingrid Isabel Isabella Jakob Jan Jana Jasmin Jens Johann Johannes Jonas '+
'Josef Julia Julian Karl Katharina Kerem Kevin Lara Laura Lea Lena Leon Leonie Lina Lisa Lukas '+
'Luisa Luis Maja Manfred Maria Marie Markus Martin Matthias Max Mehmet Michael Mila Miriam Mohammed '+
'Mohammad Moritz Murat Mustafa Nadine Natalia Nele Nils Nina Noah Oliver Olivia Omar Paul Paula '+
'Peter Petra Philipp Pia Rafael Rebecca Robert Rosa Sabine Sarah Sebastian Selin Selma Simon Sofia '+
'Sophie Stefan Stefanie Susanne Thomas Tim Tobias Uwe Viktor Vincent Walter Yasmin Yılmaz Yusuf '+
'Zeynep Zoe').split(/\s+/u));
const surnames = new Set(('Bauer Becker Berger Bergmann Braun Fischer Fuchs Hoffmann Hofmann Kaiser Keller '+
'Klein Koch Krüger Lange Lehmann Maier Mayer Meier Meyer Möller Müller Neumann Peters Richter Roth '+
'Schäfer Schmid Schmidt Schneider Schulz Schulte Schwarz Schuster Schröder Schreiber Wagner Weber '+
'Werner Wolf Zimmermann Mustermann Yılmaz Özdemir Kaya Demir Yildiz Hoffmanns Bismarck').split(/\s+/u));

const salutation = /\b(?:Herr(?:n|en)?|Frau|Hr\.?|Fr\.?|Fräulein|Familie|Patient(?:in|en)?|Dr\.|Prof\.)\s+(?:(?:Dr\.\s*(?:med\.\s*)?|Prof\.\s*|PD\s+Dr\.\s*)*)(?:([A-ZÄÖÜ][\p{L}\p{M}'’-]+|(?:von|van|de|zu)\s+[A-ZÄÖÜ][\p{L}\p{M}'’-]+)(?:\s+([A-ZÄÖÜ][\p{L}\p{M}'’-]+))?)/gu;
const labeledName = /\b(?:Name|Kontaktperson|Ansprechpartner(?:in)?|Unterschrift von|Patientenname)\s*[:=]\s*([A-ZÄÖÜ][\p{L}\p{M}'’-]+)(?:\s+([A-ZÄÖÜ][\p{L}\p{M}'’-]+))?/gu;
const twoNames = /(?<![\p{L}\p{M}])([A-ZÄÖÜ][\p{L}\p{M}'’-]+)\s+([A-ZÄÖÜ][\p{L}\p{M}'’-]+)(?![\p{L}\p{M}])/gu;

function stemSurname(value:string):string {
  if(value.endsWith("'s") || value.endsWith('’s'))return value.slice(0,-2);
  if(value.endsWith('s') && value.length>4 && surnames.has(value.slice(0,-1)))return value.slice(0,-1);
  return value;
}
function variants(value:string):string[]{
  const last=value.trim().split(/\s+/u).at(-1)!;
  const base=stemSurname(last);
  const forms=[value,last];
  if(base.length>2 && !/[sxzß]$/iu.test(base)){
    forms.push(base,base+'s',base+"'s",base+'’s');
  }else forms.push(base);
  return forms;
}

/**
 * Detect contextual German inflections such as 'des Herrn Müllers' and
 * 'der Brief des Herrn Müller'. Honorifics are never part of the sensitive
 * span. Learning is document-local; no personal text is persisted.
 */
export function scanPersonNames(text:string):NameHit[]{
  const hits:NameHit[]=[];
  const learned=new Set<string>();
  const add=(value:string,start:number):void=>{
    hits.push({start,text:value});
    for(const form of variants(value))if(form.length>2)learned.add(form);
  };
  for(const match of text.matchAll(salutation)){
    const first=match[1],second=match[2];
    if(match.index===undefined || !first)continue;
    const name=second && firstNames.has(first)?first+' '+second:first;
    add(name,match.index+match[0].lastIndexOf(name));
  }
  for(const match of text.matchAll(labeledName)){
    const first=match[1],second=match[2];
    if(match.index===undefined)continue;
    const name=first+(second?' '+second:'');
    add(name,match.index+match[0].lastIndexOf(name));
  }
  for(const match of text.matchAll(twoNames)){
    if(match.index===undefined)continue;
    if(firstNames.has(match[1]) && surnames.has(match[2]))
      add(match[0],match.index);
  }
  for(const match of findTerms(text,[...learned]))hits.push({start:match.start,text:match.text});
  return hits;
}
