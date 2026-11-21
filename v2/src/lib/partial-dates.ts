/**
 * Partial calendar expressions: detecting them is independent of permission
 * to shift them. A day/month needs an EXPLICIT reference year. Month/year
 * and month-only cannot preserve a shared *day* offset without inventing a day:
 * they are intentionally tokenised, never silently assigned an arbitrary day.
 */
import {
  MONTHS, SHORT_MONTHS, scanDates, shiftIsoDay,
  type DateLanguage, type NumericDateOrder
} from './dates';

export type PartialPrecision='day-month'|'month-year'|'month-only'|'ambiguous';
export type PartialStyle='numeric'|'day-first'|'month-first'|'month-year'|'year-month'|'month-only';
export interface PartialMatch{
  start:number;end:number;text:string;precision:PartialPrecision;
  language:DateLanguage;style:PartialStyle;month:number;day?:number;year?:number;
  separator?:string;endDot?:boolean;dayDot?:boolean;padDay?:boolean;padMonth?:boolean;
  short?:boolean;monthDot?:boolean;reason?:string;
}
export interface PartialDateOptions{numericOrder?:NumericDateOrder}
export interface ShiftedPartial{
  original:string;shifted:string;originalIso:string;shiftedIso:string;
}
export interface PartialRestoreResult{text:string;warnings:string[];changed:number}
type MonthInfo={language:DateLanguage;month:number;short:boolean};
const aliases=new Map<string,MonthInfo[]>();
function clean(s:string):string{return s.replace(/\.$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
for(const lang of ['de','en','fr','es'] as const){
  MONTHS[lang].forEach((full,i)=>{
    for(const [value,short] of [[full,false],[SHORT_MONTHS[lang][i],true]] as const){
      const key=clean(value),items=aliases.get(key)??[];
      if(!items.some(item=>item.language===lang && item.month===i+1)){
        items.push({language:lang,month:i+1,short});aliases.set(key,items);
      }
    }
  });
}
aliases.set('maerz',[{language:'de',month:3,short:false}]);
aliases.set('mrz',[{language:'de',month:3,short:true}]);
const left='(?<![\\p{L}\\p{N}])',right='(?![\\p{L}\\p{N}])';
const scanners=[
  // All patterns require month or day and are excluded if part of a full date.
  {kind:'numeric-day',re:new RegExp(left+'(?<body>\\d{1,2}[./]\\d{1,2}\\.?)'+right,'gu')},
  {kind:'day-text',re:new RegExp(left+'(?<body>\\d{1,2}\\.?\\s+(?:de\\s+)?[\\p{L}]{3,}\\.?)'+right,'giu')},
  {kind:'month-day',re:new RegExp(left+'(?<body>[\\p{L}]{3,}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?)'+right,'giu')},
  {kind:'month-year',re:new RegExp(left+'(?<body>[\\p{L}]{3,}\\.?\\s+(?:de\\s+)?\\d{4})'+right,'giu')},
  {kind:'numeric-month-year',re:new RegExp(left+'(?<body>\\d{1,2}[./]\\d{4}|\\d{4}[-/]\\d{1,2})'+right,'gu')},
  {kind:'context-month',re:new RegExp(left+'(?:im|in|en|durante)\\s+(?<body>[\\p{L}]{3,}\\.?)'+right,'giu')}
] as const;
function monthInfo(raw:string,hint?:DateLanguage):MonthInfo|null{
  const found=aliases.get(clean(raw))??[];
  return (hint?found.find(m=>m.language===hint):undefined)??found[0]??null;
}
function daysInMonth(month:number,year:number):number{
  // All partial day-month values need to be possible in at least one year.
  const d=new Date(0);d.setUTCFullYear(year,month,0);return d.getUTCDate();
}
function validMonthDay(day:number,month:number):boolean{
  return Number.isInteger(day)&&Number.isInteger(month)&&month>=1&&month<=12&&day>=1&&day<=daysInMonth(month,2024);
}
function numericContext(source:string,index:number,body:string):boolean{
  // Plain 10.03 could be a decimal value; require a calendar cue.
  if(body.endsWith('.') && body.includes('.'))return true;
  return /(?:\bam|\bvom|\bzum|\bseit|\bbis|\bab|\bon|\ble|\bel|\bdu|\bau|\bdesde|\bhasta)\s*$/iu.test(source.slice(Math.max(0,index-15),index));
}
function getParsed(
  source:string,kind:typeof scanners[number]['kind'],full:string,start:number,options:PartialDateOptions
):PartialMatch|null{
  const base={start,end:start+full.length,text:full,language:'de' as DateLanguage,
    style:'day-first' as PartialStyle,month:0};
  if(kind==='numeric-day'){
    const p=/^(\d{1,2})([./])(\d{1,2})(\.)?$/.exec(full);
    if(!p||!numericContext(source,start,full))return null;
    const [,a,sep,b,dot]=p;
    let order:NumericDateOrder=sep==='.'?'DMY':options.numericOrder??'auto';
    if(order==='auto'){
      if(+a>12 && +b<=12)order='DMY';
      else if(+b>12 && +a<=12)order='MDY';
      else order='auto';
    }
    const day=order==='MDY'?+b:+a,month=order==='MDY'?+a:+b;
    const result:PartialMatch={...base,style:'numeric',precision:order==='auto'?'ambiguous':'day-month',
      month,day,separator:sep,endDot:!!dot,language:order==='MDY'?'en':'de',
      padDay:(order==='MDY'?b:a).startsWith('0'),
      padMonth:(order==='MDY'?a:b).startsWith('0')};
    if(order==='auto')result.reason='Zahlenformat Tag/Monat nicht eindeutig';
    else if(!validMonthDay(day,month)){result.precision='ambiguous';result.reason='Ungültiger Tag oder Monat';}
    return result;
  }
  if(kind==='numeric-month-year'){
    const first=/^(\d{1,2})([./])(\d{4})$/.exec(full);
    const second=/^(\d{4})([-/])(\d{1,2})$/.exec(full);
    if(!first&&!second)return null;
    const month=first?+first[1]:+second![3],year=first?+first[3]:+second![1];
    if(month<1||month>12||year<1000||year>9999)return null;
    return {...base,precision:'month-year',month,year,
      style:first?'numeric':'year-month',separator:first?first[2]:second![2],
      padMonth:(first?first[1]:second![3]).startsWith('0')};
  }
  if(kind==='month-year'){
    const p=/^([\p{L}]{3,}\.?)(?:\s+(de))?\s+(\d{4})$/iu.exec(full);
    if(!p)return null;
    const month=monthInfo(p[1],p[2]?'es':undefined);
    if(!month||+p[3]<1000)return null;
    return {...base,precision:'month-year',style:'month-year',month:month.month,year:+p[3],
      language:month.language,short:month.short,monthDot:p[1].endsWith('.')};
  }
  if(kind==='context-month'){
    const month=monthInfo(full);
    if(!month)return null;
    return {...base,precision:'month-only',style:'month-only',month:month.month,
      language:month.language,short:month.short,monthDot:full.endsWith('.')};
  }
  if(kind==='day-text'){
    const p=/^(\d{1,2})(\.)?\s+(?:(de)\s+)?([\p{L}]{3,}\.?)$/iu.exec(full);
    if(!p)return null;
    const month=monthInfo(p[4],p[3]?'es':p[2]?'de':undefined);
    if(!month)return null;
    const day=+p[1];
    const result:PartialMatch={...base,precision:'day-month',style:'day-first',month:month.month,
      day,language:month.language,short:month.short,dayDot:!!p[2],monthDot:p[4].endsWith('.'),
      padDay:p[1].startsWith('0')};
    if(!validMonthDay(day,month.month)){result.precision='ambiguous';result.reason='Ungültiger Tag oder Monat';}
    return result;
  }
  const p=/^([\p{L}]{3,}\.?)\s+(\d{1,2})(?:st|nd|rd|th)?$/iu.exec(full);
  if(!p)return null;
  const month=monthInfo(p[1],'en');if(!month)return null;
  const day=+p[2];
  const result:PartialMatch={...base,precision:'day-month',style:'month-first',
    month:month.month,day,language:'en',short:month.short,monthDot:p[1].endsWith('.'),
    padDay:p[2].startsWith('0')};
  if(!validMonthDay(day,month.month)){result.precision='ambiguous';result.reason='Ungültiger Tag oder Monat';}
  return result;
}
/** Positions refer to the exact identified sub-expression; context words stay outside. */
export function scanPartialDates(source:string,options:PartialDateOptions={}):PartialMatch[]{
  const full=scanDates(source,{numericOrder:options.numericOrder});
  const protectedSpans=[...full.matches,...full.issues];
  const proposals:PartialMatch[]=[];
  for(const scanner of scanners)for(const hit of source.matchAll(scanner.re)){
    const body=hit.groups?.body;
    if(!body)continue;
    const start=(hit.index??0)+hit[0].indexOf(body);
    // Reject incomplete prefixes of full calendar dates, including bad dates.
    const end=start+body.length;
    if(protectedSpans.some(span=>start<span.end&&span.start<end))continue;
    const parsed=getParsed(source,scanner.kind,body,start,options);
    if(parsed)proposals.push(parsed);
  }
  proposals.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
  const kept:PartialMatch[]=[];
  for(const hit of proposals){
    if(!kept.some(other=>hit.start<other.end&&other.start<hit.end))kept.push(hit);
  }
  return kept.sort((a,b)=>a.start-b.start);
}
export function parsePartialDate(text:string,options:PartialDateOptions={}):PartialMatch|null{
  return scanPartialDates(text,options).find(hit=>hit.start===0 && hit.end===text.length)??null;
}
/** Allows day/month shifting only when the user has supplied the missing year. */
export function partialOriginalIso(match:PartialMatch,referenceYear:number|null|undefined):string|null{
  if(match.precision!=='day-month'||referenceYear===null||referenceYear===undefined||
    !Number.isInteger(referenceYear)||referenceYear<1000||referenceYear>9999)return null;
  const iso=String(referenceYear).padStart(4,'0')+'-'+String(match.month).padStart(2,'0')+'-'+String(match.day).padStart(2,'0');
  return shiftIsoDay(iso,0);
}
/** Reconstruct a shifted day/month expression in the language and syntax of the input. */
export function formatPartialLike(iso:string,template:PartialMatch):string{
  const [,monthText,dayText]=iso.split('-');
  const month=+monthText,day=+dayText;
  const d=String(day).padStart(template.padDay?2:1,'0');
  if(template.style==='numeric'){
    const m=String(month).padStart(template.padMonth?2:1,'0');
    const separator=template.separator??'.';
    return (template.language==='en'?m+separator+d:d+separator+m)+(template.endDot?'.':'');
  }
  let word=(template.short?SHORT_MONTHS:MONTHS)[template.language][month-1];
  if(template.monthDot)word+='.';
  if(template.style==='month-first')return word+' '+d;
  if(template.language==='es')return d+' de '+word;
  return d+(template.dayDot?'.':'')+' '+word;
}
/**
 * Reidentify translated yearless dates by month/day and occurrence count.
 * Unknown and duplicated dates remain unchanged with warnings. Values are
 * never guessed from the system clock or the translated document's context.
 */
export function restoreShiftedPartialDates(
  source:string, ledger:readonly ShiftedPartial[],options:PartialDateOptions={}
):PartialRestoreResult{
  if(ledger.length===0)return {text:source,warnings:[],changed:0};
  const remaining=new Map<string,ShiftedPartial[]>();
  const key=(iso:string)=>iso.slice(5);
  for(const item of ledger){
    const k=key(item.shiftedIso),entries=remaining.get(k)??[];
    entries.push(item);remaining.set(k,entries);
  }
  let text='',pos=0,changed=0;
  const warnings:string[]=[];
  for(const match of scanPartialDates(source,options)){
    if(match.precision==='month-year'||match.precision==='month-only')continue;
    text+=source.slice(pos,match.start);
    const k=String(match.month).padStart(2,'0')+'-'+String(match.day).padStart(2,'0');
    const saved=match.precision==='day-month'?remaining.get(k)?.shift():undefined;
    if(saved){
      text+=formatPartialLike(saved.originalIso,match);
      changed++;
    }else{
      text+=match.text;
      warnings.push('Unbekannte, doppelte oder uneindeutige unvollständige Datumsangabe "'+match.text+'" nicht zurückverschoben.');
    }
    pos=match.end;
  }
  for(const entries of remaining.values())for(const missing of entries){
    warnings.push('Verschobene Datumsangabe "'+missing.shifted+'" fehlt im KI-Ergebnis.');
  }
  return {text:text+source.slice(pos),warnings,changed};
}
