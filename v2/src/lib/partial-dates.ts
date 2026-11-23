/**
 * Partial calendar expressions: dates containing a day and month can be
 * shifted against a fixed, internal leap year (2000). The original year is
 * intentionally not guessed, displayed or added to the exported text.
 * Other incomplete expressions cannot carry a meaningful day-based offset
 * and stay protected by tokens.
 */
import {
  MONTHS, SHORT_MONTHS, scanDates, scanDateRanges, shiftIsoDay, calendarDayDifference,
  type DateLanguage, type NumericDateOrder
} from './dates';

export type PartialPrecision='day-month'|'month-year'|'month-only'|'day-only'|'year-only'|'ambiguous';
export type PartialStyle='numeric'|'day-first'|'month-first'|'month-year'|'year-month'|'month-only'|'day-only'|'year-only';
export interface PartialMatch{
  start:number;end:number;text:string;precision:PartialPrecision;
  language:DateLanguage;style:PartialStyle;month:number;day?:number;year?:number;
  separator?:string;endDot?:boolean;dayDot?:boolean;padDay?:boolean;padMonth?:boolean;
  short?:boolean;monthDot?:boolean;reason?:string;
}
export interface PartialDateOptions{numericOrder?:NumericDateOrder;offsetDays?:number}
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
  {kind:'context-month',re:new RegExp(left+'(?:im|in|en|durante)\\s+(?<body>[\\p{L}]{3,}\\.?)'+right,'giu')},
  {kind:'context-day',re:new RegExp(left+'(?:am|on\\s+the|le|el)\\s+(?<body>\\d{1,2}(?:st|nd|rd|th)?\\.?)'+right,'giu')},
  {kind:'context-year',re:new RegExp(left+'(?:im\\s+Jahr|in|en|durante\\s+el\\s+año)\\s+(?<body>\\d{4})'+right,'giu')}
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
  if(kind==='context-year'){
    const year=+full;
    if(year<1000||year>9999)return null;
    return {...base,precision:'year-only',style:'year-only',year,month:0};
  }
  if(kind==='context-day'){
    const p=/^(\d{1,2})(?:st|nd|rd|th)?\.?$/iu.exec(full);
    if(!p)return null;
    const day=+p[1];
    if(day<1||day>31)return null;
    return {...base,precision:'day-only',style:'day-only',day,month:0};
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
  const protectedSpans=[...scanDateRanges(source),...full.matches,...full.issues];
  const proposals:PartialMatch[]=[];
  for(const scanner of scanners)for(const hit of source.matchAll(scanner.re)){
    const rawBody=hit.groups?.body;
    if(!rawBody)continue;
    let body=rawBody;
    // A period after a spelled-out month ("10. Mai.") is sentence punctuation,
    // not part of the date. Keep the period for genuine short forms ("10. Mrz.").
    if(scanner.kind==='day-text' && body.endsWith('.')){
      const word=/([\p{L}]+)\.$/u.exec(body)?.[1];
      if(word && monthInfo(word)?.short===false)body=body.slice(0,-1);
    }
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
/** A leap-year anchor supports 29 February and permits an exact reversible shift. */
export const INTERNAL_PARTIAL_REFERENCE_YEAR=2000;
export function partialOriginalIso(
  match:PartialMatch,referenceYear:number|null|undefined=INTERNAL_PARTIAL_REFERENCE_YEAR
):string|null{
  if(match.precision!=='day-month'||referenceYear===null||referenceYear===undefined||
    !Number.isInteger(referenceYear)||referenceYear<1000||referenceYear>9999)return null;
  const iso=String(referenceYear).padStart(4,'0')+'-'+String(match.month).padStart(2,'0')+'-'+String(match.day).padStart(2,'0');
  return shiftIsoDay(iso,0);
}
/**
 * When editing two yearless dates, choose the nearest calendar displacement.
 * This handles transitions like 11 November → 10 January as +60 rather than
 * -306 days. Larger displacements are ambiguous without a real year and can
 * instead be entered in the advanced settings as a numeric offset.
 */
export function nearestPartialDateOffset(from:PartialMatch,to:PartialMatch):number|null{
  const source=partialOriginalIso(from);
  if(!source||to.precision!=='day-month')return null;
  const candidates:number[]=[];
  for(const year of [1999,2000,2001]){
    const projected=shiftIsoDay(
      String(year)+'-'+String(to.month).padStart(2,'0')+'-'+String(to.day).padStart(2,'0'),0
    );
    if(projected){
      const distance=calendarDayDifference(source,projected);
      if(distance!==null)candidates.push(distance);
    }
  }
  candidates.sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b);
  return candidates[0]??null;
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
 * Reidentify known yearless dates and, when a valid session offset is supplied,
 * derive new dates created by the AI from the same calendar displacement.
 * Omissions and repeated dates are normal, not data-integrity errors.
 */
export function restoreShiftedPartialDates(
  source:string,ledger:readonly ShiftedPartial[],options:PartialDateOptions={}
):PartialRestoreResult{
  if(!ledger.length)return {text:source,warnings:[],changed:0};
  const knownByDayMonth=new Map<string,ShiftedPartial>();
  const key=(iso:string)=>iso.slice(5);
  for(const entry of ledger){
    if(!knownByDayMonth.has(key(entry.shiftedIso)))knownByDayMonth.set(key(entry.shiftedIso),entry);
  }
  const offset=options.offsetDays;
  const canDerive=Number.isSafeInteger(offset)&&offset!==0&&Math.abs(offset as number)<=3650;
  let text='',pos=0,changed=0;
  const warnings:string[]=[];
  for(const match of scanPartialDates(source,options)){
    if(match.precision!=='day-month' && match.precision!=='ambiguous')continue;
    text+=source.slice(pos,match.start);
    const dayMonth=String(match.month).padStart(2,'0')+'-'+String(match.day).padStart(2,'0');
    const known=match.precision==='day-month'?knownByDayMonth.get(dayMonth):undefined;
    let originalIso=known?.originalIso??null;
    if(!originalIso && match.precision==='day-month' && canDerive){
      // Pick a valid calendar year closest to known shifted days, handling
      // Feb 29 and New Year's crossings without a current-year assumption.
      const years=new Set<number>();
      for(const entry of ledger){
        const year=Number(entry.shiftedIso.slice(0,4));
        for(const delta of [-1,0,1])years.add(year+delta);
      }
      let best:{iso:string;distance:number}|null=null;
      for(const year of years){
        const candidate=shiftIsoDay(String(year).padStart(4,'0')+'-'+dayMonth,0);
        if(!candidate)continue;
        const distance=Math.min(...ledger.map(entry=>
          Math.abs(calendarDayDifference(entry.shiftedIso,candidate)??Infinity)
        ));
        if(!best || distance<best.distance)best={iso:candidate,distance};
      }
      originalIso=best?shiftIsoDay(best.iso,-(offset as number)):null;
    }
    if(originalIso){
      text+=formatPartialLike(originalIso,match);
      changed++;
    }else{
      text+=match.text;
      if(match.precision==='ambiguous')
        warnings.push('Uneindeutige unvollständige Datumsangabe "'+match.text+'" nicht zurückverschoben.');
    }
    pos=match.end;
  }
  return {text:text+source.slice(pos),warnings,changed};
}
