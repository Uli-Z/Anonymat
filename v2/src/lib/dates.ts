/** Locale-independent calendar-day shifting. Never use local timestamps or Date.parse. */
export type DateLanguage='de'|'en'|'fr'|'es';
export type NumericDateOrder='auto'|'DMY'|'MDY';
export interface DateOptions{numericOrder?:NumericDateOrder;restoreDerivedDates?:boolean}
type Style='iso'|'numeric'|'day-first'|'month-first';
export interface DateMatch{
  start:number;end:number;text:string;iso:string;language:DateLanguage;style:Style;
  separator?:string;padDay?:boolean;padMonth?:boolean;dayDot?:boolean;
  monthAbbreviated?:boolean;monthDot?:boolean;weekday?:string;weekdayPrefix?:string;
}
export interface DateIssue{start:number;end:number;text:string;reason:string}
export interface DateScan{matches:DateMatch[];issues:DateIssue[]}
export interface DateReplacement{original:string;shifted:string;shiftedIso:string}
export interface DateRestoreResult{text:string;warnings:string[];changed:number}
const LANGUAGES:DateLanguage[]=['de','en','fr','es'];
export const MONTHS:Record<DateLanguage,readonly string[]>={
  de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  en:['January','February','March','April','May','June','July','August','September','October','November','December'],
  fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
  es:['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
};
export const SHORT_MONTHS:Record<DateLanguage,readonly string[]>={
  de:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
  en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  fr:['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'],
  es:['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
};
export const WEEKDAYS:Record<DateLanguage,readonly string[]>={
  de:['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'],
  en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  fr:['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
  es:['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
};
export const SHORT_WEEKDAYS:Record<DateLanguage,readonly string[]>={
  de:['So','Mo','Di','Mi','Do','Fr','Sa'],
  en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  fr:['dim','lun','mar','mer','jeu','ven','sam'],
  es:['dom','lun','mar','mié','jue','vie','sáb']
};
function clean(word:string):string{
  return word.replace(/\.$/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
const months=new Map<string,{language:DateLanguage;month:number;short:boolean}[]>();
for(const language of LANGUAGES)MONTHS[language].forEach((full,i)=>{
  for(const [word,short] of [[full,false],[SHORT_MONTHS[language][i],true]] as const){
    const key=clean(word),entries=months.get(key)??[];
    if(!entries.some(item=>item.language===language&&item.month===i+1))
      entries.push({language,month:i+1,short});
    months.set(key,entries);
  }
});
months.set('maerz',[{language:'de',month:3,short:false}]);
months.set('mrz',[{language:'de',month:3,short:true}]);
const weekdayWords=[...new Set(LANGUAGES.flatMap(lang=>[...WEEKDAYS[lang],...SHORT_WEEKDAYS[lang]]))]
  .sort((a,b)=>b.length-a.length);
const weekdayPattern=weekdayWords.map(word=>word.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|');
const prefix='(?:(?<weekday>'+weekdayPattern+')\\.?\\s*,?\\s+)?';
// Allow a missing space after a complete calendar date (10.03.2026wurde).
// Do not treat one- or two-letter ID suffixes as a word glued to a date.
// A missing space after frequent date cues is also accepted (am10.03.2026).
const left='(?:(?<![\\p{L}\\p{N}])|(?<=\\b(?:am|vom|bis|seit|geb\\.?)))';
const right='(?:(?![\\p{L}\\p{N}])|(?=(?:[\\p{L}]{3,}|am|um|im|ab|an|in|zu)(?![\\p{L}\\p{N}])))';
const SCANNERS=[
  {style:'numeric',re:new RegExp(left+prefix+'(?<body>(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}))'+right,'giu')},
  {style:'day-first',re:new RegExp(left+prefix+'(?<body>\\d{1,2}\\.?\\s+(?:de\\s+)?[\\p{L}]+\\.?\\s+(?:de\\s+)?\\d{4})'+right,'giu')},
  {style:'month-first',re:new RegExp(left+prefix+'(?<body>[\\p{L}]+\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s+\\d{4})'+right,'giu')}
] as const;
function toIso(y:number,m:number,d:number):string|null{
  if(!Number.isInteger(y)||y<1000||y>9999||m<1||m>12||d<1||d>31)return null;
  const value=new Date(0);value.setUTCHours(0,0,0,0);value.setUTCFullYear(y,m-1,d);
  if(value.getUTCFullYear()!==y||value.getUTCMonth()!==m-1||value.getUTCDate()!==d)return null;
  return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
function parts(iso:string):[number,number,number]{return iso.split('-').map(Number) as [number,number,number];}
function weekdayOf(iso:string):number{
  const [y,m,d]=parts(iso),value=new Date(0);value.setUTCFullYear(y,m-1,d);return value.getUTCDay();
}
export function shiftIsoDay(iso:string,offset:number):string|null{
  if(!Number.isSafeInteger(offset)||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const [y,m,d]=parts(iso);if(!toIso(y,m,d))return null;
  const value=new Date(0);value.setUTCHours(0,0,0,0);value.setUTCFullYear(y,m-1,d+offset);
  return toIso(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate());
}
function weekdayInfo(word:string,language:DateLanguage):{day:number;short:boolean}|null{
  const w=clean(word),full=WEEKDAYS[language].findIndex(x=>clean(x)===w);
  if(full>=0)return {day:full,short:false};
  const shorter=SHORT_WEEKDAYS[language].findIndex(x=>clean(x)===w);
  return shorter>=0?{day:shorter,short:true}:null;
}
function chooseMonth(word:string,hint:DateLanguage|null,weekday:string|undefined,englishFirst:boolean){
  let options=months.get(clean(word))??[];
  if(englishFirst)options=options.filter(item=>item.language==='en');
  if(hint)options=options.filter(item=>item.language===hint);
  if(weekday)options=options.filter(item=>weekdayInfo(weekday,item.language)!==null);
  return options[0]??null;
}
function issue(hit:RegExpMatchArray,reason:string):DateIssue{
  const start=hit.index??0;
  return {start,end:start+hit[0].length,text:hit[0],reason};
}
function parseCandidate(hit:RegExpMatchArray,style:typeof SCANNERS[number]['style'],options:DateOptions):DateMatch|DateIssue|null{
  const body=hit.groups?.body??'',weekday=hit.groups?.weekday;
  let iso:string|null=null,language:DateLanguage='de',format:Style='numeric';
  let separator:string|undefined,padDay=false,padMonth=false,dayDot=false,monthAbbreviated=false,monthDot=false;
  if(style==='numeric'){
    const canonical=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(body);
    if(canonical){format='iso';iso=toIso(+canonical[1],+canonical[2],+canonical[3]);}
    else{
      const number=/^(\d{1,2})([./-])(\d{1,2})([./-])(\d{4})$/.exec(body);
      if(!number)return null;
      const [,a,sep,b,sep2,year]=number;
      if(sep!==sep2)return issue(hit,'Gemischte Datumstrennzeichen');
      separator=sep;
      let order:NumericDateOrder=sep==='.'?'DMY':options.numericOrder??'auto';
      if(order==='auto'){
        if(+a>12&&+b<=12)order='DMY';
        else if(+b>12&&+a<=12)order='MDY';
        else if(+a<=12&&+b<=12)return issue(hit,'Mehrdeutiges numerisches Datum');
        else return issue(hit,'Ungültiges numerisches Datum');
      }
      language=order==='MDY'?'en':'de';
      iso=order==='MDY'?toIso(+year,+a,+b):toIso(+year,+b,+a);
      padDay=(order==='MDY'?b:a).length===2;
      padMonth=(order==='MDY'?a:b).length===2;
    }
  }else if(style==='day-first'){
    const p=/^(\d{1,2})(\.)?\s+(?:(de)\s+)?([\p{L}]+\.?)\s+(?:(de)\s+)?(\d{4})$/iu.exec(body);
    if(!p)return null;
    const [,day,dot,pre,monthWord,post,year]=p;
    const hint:DateLanguage|null=(pre||post)?'es':dot?'de':null;
    const month=chooseMonth(monthWord,hint,weekday,false);
    if(!month)return null;
    language=month.language;format='day-first';dayDot=!!dot;
    monthDot=monthWord.endsWith('.');monthAbbreviated=month.short||monthDot;
    padDay=day.startsWith('0');iso=toIso(+year,month.month,+day);
  }else{
    const p=/^([\p{L}]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(\d{4})$/iu.exec(body);
    if(!p)return null;
    const [,monthWord,day,year]=p,month=chooseMonth(monthWord,'en',weekday,true);
    if(!month)return null;
    language='en';format='month-first';monthDot=monthWord.endsWith('.');
    monthAbbreviated=month.short||monthDot;padDay=day.startsWith('0');iso=toIso(+year,month.month,+day);
  }
  if(!iso)return issue(hit,'Ungültiger Kalendertag');
  if(weekday){
    const info=weekdayInfo(weekday,language);
    if(!info||info.day!==weekdayOf(iso))return issue(hit,'Wochentag widerspricht dem Datum');
  }
  const weekdayPrefix=weekday?hit[0].slice(0,hit[0].indexOf(body)):undefined;
  const start=hit.index??0;
  return {start,end:start+hit[0].length,text:hit[0],iso,language,
    style:format,separator,padDay,padMonth,dayDot,monthAbbreviated,monthDot,weekday,weekdayPrefix};
}
export function scanDates(source:string,options:DateOptions={}):DateScan{
  const proposals:(DateMatch|DateIssue)[]=[];
  for(const scanner of SCANNERS)for(const hit of source.matchAll(scanner.re)){
    const parsed=parseCandidate(hit,scanner.style,options);if(parsed)proposals.push(parsed);
  }
  proposals.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
  const matches:DateMatch[]=[],issues:DateIssue[]=[];let next=0;
  for(const item of proposals){
    if(item.start<next)continue;
    if('iso' in item)matches.push(item);else issues.push(item);
    next=item.end;
  }
  return {matches,issues};
}
export function parseDate(text:string,options:DateOptions={}):DateMatch|null{
  return scanDates(text,options).matches.find(m=>m.start===0&&m.end===text.length)??null;
}
/** Signed difference of two validated UTC calendar days. */
export function calendarDayDifference(fromIso:string,toIso:string):number|null{
  if(!shiftIsoDay(fromIso,0)||!shiftIsoDay(toIso,0))return null;
  const [fy,fm,fd]=parts(fromIso),[ty,tm,td]=parts(toIso);
  return (Date.UTC(ty,tm-1,td)-Date.UTC(fy,fm-1,fd))/86400000;
}
export function formatLike(iso:string,template:DateMatch):string{
  const [y,m,d]=parts(iso),day=String(d).padStart(template.padDay?2:1,'0');
  const month=String(m).padStart(template.padMonth?2:1,'0');
  let body:string;
  if(template.style==='iso')body=iso;
  else if(template.style==='numeric'){
    const sep=template.separator??'.';
    body=template.language==='en'&&sep!=='.'
      ?month+sep+day+sep+y:day+sep+month+sep+y;
  }else{
    let name=(template.monthAbbreviated?SHORT_MONTHS:MONTHS)[template.language][m-1];
    if(template.monthDot)name+='.';
    if(template.style==='month-first')body=name+' '+day+', '+y;
    else if(template.language==='es')body=day+' de '+name+' de '+y;
    else body=day+(template.dayDot?'.':'')+' '+name+' '+y;
  }
  if(!template.weekday)return body;
  const short=weekdayInfo(template.weekday,template.language)?.short;
  const name=(short?SHORT_WEEKDAYS:WEEKDAYS)[template.language][weekdayOf(iso)];
  const adjusted=template.weekday===template.weekday.toUpperCase()?name.toUpperCase():
    /^[A-ZÄÖÜ]/.test(template.weekday)?name[0].toUpperCase()+name.slice(1):name;
  return adjusted+(template.weekdayPrefix??' ').slice(template.weekday.length)+body;
}
export function formatIsoDate(iso:string,language:DateLanguage,style:'text'|'numeric'='text'):string{
  const [y,m,d]=parts(iso);if(!toIso(y,m,d))throw new Error('Invalid ISO date');
  if(style==='numeric')return language==='en'?String(m).padStart(2,'0')+'/'+String(d).padStart(2,'0')+'/'+y:
    String(d).padStart(2,'0')+'.'+String(m).padStart(2,'0')+'.'+y;
  const word=MONTHS[language][m-1];
  if(language==='en')return word+' '+d+', '+y;
  if(language==='es')return d+' de '+word+' de '+y;
  return d+(language==='de'?'. ':' ')+word+' '+y;
}
/** Uniform nonzero random offset from Web Crypto. */
export function randomDateOffset():number{
  const c=globalThis.crypto;
  if(!c?.getRandomValues)throw new Error('Web Crypto is required');
  const count=2*(365-30+1),limit=Math.floor(0x100000000/count)*count;
  const buffer=new Uint32Array(1);
  do{c.getRandomValues(buffer);}while(buffer[0]>=limit);
  const n=buffer[0]%count;
  return (n<count/2?-1:1)*(30+n%(count/2));
}
/**
 * German date ranges whose first endpoint omits its year, e.g.
 * "06.01.-10.01.2025". The year is inferred solely from the explicit end:
 * a start month/day later than the end belongs to the previous year.
 */
export interface DateRangeMatch{
  start:number;end:number;text:string;startIso:string;endIso:string;join:string;
  startPadDay:boolean;startPadMonth:boolean;endPadDay:boolean;endPadMonth:boolean;
}
const DATE_RANGE=/(?<![\p{L}\p{N}])(\d{1,2})\.(\d{1,2})\.(\s*[-–—]\s*)(\d{1,2})\.(\d{1,2})\.(\d{4})(?![\p{L}\p{N}])/gu;
function dateField(n:number,padded:boolean):string{return String(n).padStart(padded?2:1,'0');}
export function scanDateRanges(source:string):DateRangeMatch[]{
  const found:DateRangeMatch[]=[];
  for(const hit of source.matchAll(DATE_RANGE)){
    const [,firstDay,firstMonth,join,lastDay,lastMonth,year]=hit;
    const end=toIso(+year,+lastMonth,+lastDay);
    if(!end)continue;
    const crossing=+firstMonth>+lastMonth || (+firstMonth===+lastMonth && +firstDay>+lastDay);
    const start=toIso(+year-(crossing?1:0),+firstMonth,+firstDay);
    if(!start)continue;
    const length=calendarDayDifference(start,end);
    if(length===null||length<0||length>366)continue;
    found.push({
      start:hit.index,end:hit.index+hit[0].length,text:hit[0],startIso:start,endIso:end,join,
      startPadDay:firstDay.length===2,startPadMonth:firstMonth.length===2,
      endPadDay:lastDay.length===2,endPadMonth:lastMonth.length===2
    });
  }
  return found;
}
export function parseDateRange(text:string):DateRangeMatch|null{
  return scanDateRanges(text).find(hit=>hit.start===0&&hit.end===text.length)??null;
}
export function shiftDateRange(range:DateRangeMatch,offset:number):string|null{
  const start=shiftIsoDay(range.startIso,offset),end=shiftIsoDay(range.endIso,offset);
  if(!start||!end)return null;
  const [,sm,sd]=parts(start),[ey,em,ed]=parts(end);
  return dateField(sd,range.startPadDay)+'.'+dateField(sm,range.startPadMonth)+'.'+range.join+
    dateField(ed,range.endPadDay)+'.'+dateField(em,range.endPadMonth)+'.'+ey;
}
/**
 * Reverse every recognized date using the actual session offset, including
 * derived/repeated dates which were not in the input. Missing input dates are
 * normal in summaries and never produce errors.
 *
 * The shifted-date ledger (or a separate partial-date ledger via the explicit
 * option) gates this feature: arbitrary AI dates must not be changed without
 * evidence that the input dates were shifted.
 */
export function restoreShiftedDates(
  source:string,shiftedIsos:readonly string[],offset:number,options:DateOptions={}
):DateRestoreResult{
  if((!shiftedIsos.length&&!options.restoreDerivedDates)||
    !Number.isSafeInteger(offset)||offset===0||Math.abs(offset)>3650)
    return {text:source,warnings:[],changed:0};
  const scan=scanDates(source,options);
  const ranges=scanDateRanges(source);
  const overlapsRange=(start:number,end:number)=>ranges.some(range=>start<range.end&&range.start<end);
  const warnings=scan.issues.filter(item=>!overlapsRange(item.start,item.end))
    .map(item=>'Datum "'+item.text+'": '+item.reason+'.');
  const entries:Array<{start:number;end:number;date?:DateMatch;range?:DateRangeMatch}>=[
    ...ranges.map(range=>({start:range.start,end:range.end,range})),
    ...scan.matches.filter(match=>!overlapsRange(match.start,match.end))
      .map(date=>({start:date.start,end:date.end,date}))
  ].sort((a,b)=>a.start-b.start);
  let text='',pos=0,changed=0;
  for(const entry of entries){
    if(entry.start<pos)continue;
    text+=source.slice(pos,entry.start);
    if(entry.range){
      const original=shiftDateRange(entry.range,-offset);
      if(original){text+=original;changed++;}
      else{
        text+=entry.range.text;
        warnings.push('Datumsbereich "'+entry.range.text+'" kann nicht zurückverschoben werden.');
      }
    }else if(entry.date){
      const original=shiftIsoDay(entry.date.iso,-offset);
      if(original){text+=formatLike(original,entry.date);changed++;}
      else{
        text+=entry.date.text;
        warnings.push('Datum "'+entry.date.text+'" kann nicht zurückverschoben werden.');
      }
    }
    pos=entry.end;
  }
  return {text:text+source.slice(pos),warnings,changed};
}
