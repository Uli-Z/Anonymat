import { describe, expect, it } from 'vitest';
import type { Finding, Kind } from '../src/lib/detect';
import { maskText, restoreText, splitForPreview } from '../src/lib/replace';
import { replacementKey } from '../src/lib/replacement-strategies';
import { syntheticReplacement } from '../src/lib/synthetic';

const seed=0x12345678;
function hits(source:string,items:Array<{value:string;kind:Kind}>):Finding[]{
  let from=0;
  return items.map(({value,kind},index)=>{
    const start=source.indexOf(value,from);
    if(start<0)throw Error('Missing fixture: '+value);
    from=start+value.length;
    return {id:'mark-'+index,origin:'manual',kind,start,end:from,text:value};
  });
}

describe('synthetic pseudonyms from bundled lexica',()=>{
  it('repeats the same value and restores the original text',()=>{
    const source='Anna traf Anna in Bremen.';
    const result=maskText(source,hits(source,[
      {value:'Anna',kind:'FIRST_NAME'},{value:'Anna',kind:'FIRST_NAME'},
      {value:'Bremen',kind:'CITY'}
    ]),{}, {defaultReplacementMode:'synthetic',syntheticSeed:seed});
    expect(result.mapping).toHaveLength(2);
    const [alias,city]=result.mapping.map(entry=>entry.token);
    expect(alias).not.toBe('Anna');
    expect(city).not.toBe('Bremen');
    expect(result.text).toBe(alias+' traf '+alias+' in '+city+'.');
    expect(result.replacementSpans.map(span=>span.mode)).toEqual(['synthetic','synthetic','synthetic']);
    expect(splitForPreview(result.text,[],result.replacementSpans).filter(part=>part.replaced)).toHaveLength(3);
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });

  it('keeps a surname stable across a full name, surname and genitive',()=>{
    const source='Anna Müller sagte, Müller stimme Müllers Aussage zu.';
    const result=maskText(source,hits(source,[
      {value:'Anna Müller',kind:'PERSON'},{value:'Müller',kind:'PERSON'},
      {value:'Müllers',kind:'LAST_NAME'}
    ]),{}, {defaultReplacementMode:'synthetic',syntheticSeed:seed});
    const full=result.mapping[0].token.split(' ');
    expect(full).toHaveLength(2);
    expect(result.mapping[1].token).toBe(full[1]);
    expect(result.mapping[2].token).toBe(full[1]+'s');
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });

  it('shares an alias when the same surname has different detected categories',()=>{
    const source='Müller und Müller';
    const result=maskText(source,hits(source,[
      {value:'Müller',kind:'PERSON'},{value:'Müller',kind:'LAST_NAME'}
    ]),{}, {defaultReplacementMode:'synthetic',syntheticSeed:seed});
    expect(result.mapping[0].token).toBe(result.mapping[1].token);
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });

  it('allows explicit per-term placeholder and synthetic overrides',()=>{
    const source='Anna wohnte in Bremen.';
    const active=hits(source,[{value:'Anna',kind:'FIRST_NAME'},{value:'Bremen',kind:'CITY'}]);
    const masked=maskText(source,active,{
      [replacementKey('FIRST_NAME','Anna')]:{mode:'token',kind:'FIRST_NAME'},
      [replacementKey('CITY','Bremen')]:{mode:'synthetic',kind:'CITY'}
    },{defaultReplacementMode:'synthetic',syntheticSeed:seed});
    expect(masked.text).toContain('[FIRST_NAME_001]');
    expect(masked.mapping[1].token).not.toMatch(/^\[/);
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
  });

  it('changes street names and house numbers without exposing the original',()=>{
    const source='Termin: Reichenberger Straße 12, Bremen.';
    const result=maskText(source,hits(source,[
      {value:'Reichenberger Straße 12',kind:'ADDRESS'},
      {value:'Bremen',kind:'CITY'}
    ]),{}, {defaultReplacementMode:'synthetic',syntheticSeed:seed});
    expect(result.mapping[0].token).toMatch(/\s+\d+[a-zA-Z]?$/);
    expect(result.mapping[0].token).not.toBe('Reichenberger Straße 12');
    expect(result.text).not.toContain('Reichenberger Straße');
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });

  it('uses placeholders for kinds without a safe synthetic generator',()=>{
    const source='ID: Geheimcode-7';
    const result=maskText(source,hits(source,[{value:'Geheimcode-7',kind:'ID'}]),
      {},{defaultReplacementMode:'synthetic',syntheticSeed:seed});
    expect(result.text).toBe('ID: [ID_001]');
  });

  it('marks shifted complete and yearless dates even next to unconfirmed names',()=>{
    const source='Anna am 11.11.2026 sah Peter am 11. November.';
    const date1=source.indexOf('11.11.2026'),date2=source.indexOf('11. November');
    const active=hits(source,[
      {value:'Anna',kind:'FIRST_NAME'},
      {value:'11.11.2026',kind:'DATE'},
      {value:'11. November',kind:'DATE'}
    ]);
    const review:Finding={id:'review',origin:'automatic',kind:'FIRST_NAME',
      start:source.indexOf('Peter'),end:source.indexOf('Peter')+5,text:'Peter',confidence:'review'};
    const result=maskText(source,active,{},{
      dateShiftEnabled:true,offsetDays:30,defaultReplacementMode:'synthetic',syntheticSeed:seed
    },[review]);
    expect(date1).toBeGreaterThan(0);
    expect(date2).toBeGreaterThan(date1);
    expect(result.replacementSpans.map(span=>span.mode)).toEqual(['synthetic','shift-date','shift-date']);
    for(const span of result.replacementSpans)
      expect(result.text.slice(span.start,span.end)).toBe(span.text);
    expect(result.text.slice(result.reviewSpans[0].start,result.reviewSpans[0].end)).toBe('Peter');
    const parts=splitForPreview(result.text,result.reviewSpans,result.replacementSpans);
    expect(parts.filter(part=>part.mode==='shift-date')).toHaveLength(2);
    expect(parts.filter(part=>part.review).map(part=>part.value)).toEqual(['Peter']);
  });

  it('never uses an unchanged source name as a replacement',()=>{
    const source='Anna und Alex und Maria und Petra.';
    const aliases=new Map<string,string>();
    for(const original of ['Anna','Alex','Maria','Petra']){
      const value=syntheticReplacement('FIRST_NAME',original,seed,source,aliases);
      expect(value).not.toBeNull();
      expect(source.includes(value!)).toBe(false);
    }
    expect(new Set(aliases.values()).size).toBe(4);
  });
});
