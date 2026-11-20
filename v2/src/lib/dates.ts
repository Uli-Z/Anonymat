/** Locale-independent calendar-day shifting. Never use local timestamps or Date.parse. */
export type DateLanguage='de'|'en'|'fr'|'es';
export type NumericDateOrder='auto'|'DMY'|'MDY';
export interface DateOptions{numericOrder?:NumericDateOrder}
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
const MONTHS:Record<DateLanguage,readonly string[]>={
  de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  en:['January','February','March','April','May','June','July','August','September','October','November','December'],
  fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
  es:['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
};
const SHORT_MONTHS:Record<DateLanguage,readonly string[]>={
  de:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
  en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  fr:['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'],
  es:['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
};
const WEEKDAYS:Record<DateLanguage,readonly string[]>={
  de:['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'],
  en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  fr:['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
  es:['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
};
const SHORT_WEEKDAYS:Record<DateLanguage,readonly string[]>={
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
const left='(?<![\\p{L}\\p{N}])',right='(?![\\p{L}\\p{N}])';
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
/** Reverse only dates actually exported by this session; unknown dates are not touched. */
export function restoreShiftedDates(source:string,shiftedIsos:readonly string[],offset:number,options:DateOptions={}):DateRestoreResult{
  if(!shiftedIsos.length)return {text:source,warnings:[],changed:0};
  const allowed=new Set(shiftedIsos),scan=scanDates(source,options);
  const warnings=scan.issues.map(item=>'Datum "'+item.text+'": '+item.reason+'.');
  let text='',pos=0,changed=0;
  for(const match of scan.matches){
    text+=source.slice(pos,match.start);
    if(!allowed.has(match.iso)){
      text+=match.text;warnings.push('Unbekanntes Datum "'+match.text+'" nicht zurückverschoben.');
    }else{
      const original=shiftIsoDay(match.iso,-offset);
      if(original){text+=formatLike(original,match);changed++;}
      else{text+=match.text;warnings.push('Datum "'+match.text+'" kann nicht zurückverschoben werden.');}
    }
    pos=match.end;
  }
  return {text:text+source.slice(pos),warnings,changed};
}
