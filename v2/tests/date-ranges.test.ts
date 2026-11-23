import {describe,expect,it} from 'vitest';
import {scanDates,restoreShiftedDates} from '../src/lib/dates';
import {scanPartialDates,restoreShiftedPartialDates} from '../src/lib/partial-dates';
import {detectPII} from '../src/lib/detect';
import {maskText,restoreText} from '../src/lib/replace';
import {replacementKey} from '../src/lib/replacement-strategies';

function restoredDateText(text:string,offset:number):string{
  const masked=maskText(text,detectPII(text),{}, {dateShiftEnabled:true,offsetDays:offset});
  const partial=restoreShiftedPartialDates(masked.text,masked.partialDates,{
    offsetDays:offset,shiftedFullDates:masked.dates.map(date=>date.shiftedIso)
  });
  const full=restoreShiftedDates(partial.text,masked.dates.map(date=>date.shiftedIso),offset,
    {restoreDerivedDates:masked.partialDates.length>0});
  expect(partial.warnings).toEqual([]);
  expect(full.warnings).toEqual([]);
  return restoreText(full.text,masked.mapping).text;
}

describe('two independently editable dates separated by a dash',()=>{
  it('finds the short date and full date separately, never a combined DATE or PHONE',()=>{
    for(const source of ['06.01.-10.01.2025','06.01. – 10.01.2025','6.1.–10.1.2025']){
      const hits=detectPII(source);
      const short=source.slice(0,source.indexOf('–')>=0?source.indexOf('–'):source.indexOf('-')).trimEnd();
      const full=source.slice(source.indexOf('–')>=0?source.indexOf('–')+1:source.indexOf('-')+1).trimStart();
      expect(hits.filter(hit=>hit.kind==='DATE').map(hit=>hit.text),source).toEqual([short,full]);
      expect(hits.filter(hit=>hit.kind==='PHONE'),source).toEqual([]);
      expect(scanDates(source).matches.map(hit=>hit.text)).toEqual([full]);
      expect(scanPartialDates(source).map(hit=>hit.text)).toEqual([short]);
    }
  });

  it('shifts each finding independently while leaving the separator intact',()=>{
    const source='Vom 06.01.-10.01.2025 fand die Behandlung statt.';
    const hits=detectPII(source);
    const masked=maskText(source,hits,{}, {dateShiftEnabled:true,offsetDays:30});
    expect(masked.text).toBe('Vom 05.02.-09.02.2025 fand die Behandlung statt.');
    expect(masked.partialDates).toHaveLength(1);
    expect(masked.partialDates[0].originalIso).toBe('2025-01-06');
    expect(masked.dates).toHaveLength(1);
    expect(masked.replacementSpans.map(span=>span.text)).toEqual(['05.02.','09.02.2025']);
    expect(restoredDateText(source,30)).toBe(source);
  });

  it('allows one endpoint to be a token without changing the other',()=>{
    const source='06.01.-10.01.2025',hits=detectPII(source);
    const shortAsToken=maskText(source,hits,{
      [replacementKey('DATE','06.01.')]:{mode:'token',kind:'DATE'}
    },{dateShiftEnabled:true,offsetDays:30});
    expect(shortAsToken.text).toBe('[DATE_001]-09.02.2025');
    expect(shortAsToken.dates).toHaveLength(1);
    expect(shortAsToken.partialDates).toEqual([]);
    const fullAsToken=maskText(source,hits,{
      [replacementKey('DATE','10.01.2025')]:{mode:'token',kind:'DATE'}
    },{dateShiftEnabled:true,offsetDays:30});
    expect(fullAsToken.text).toBe('05.02.-[DATE_001]');
    expect(fullAsToken.partialDates).toHaveLength(1);
    expect(fullAsToken.dates).toEqual([]);
  });

  it('handles New Year and real leap-year context for the short endpoint',()=>{
    for(const [source,offset,shifted] of [
      ['29.12.-02.01.2025',30,'28.1.-01.02.2025'],
      ['28.02.-02.03.2025',1,'1.03.-03.03.2025'],
      ['29.02.-02.03.2024',1,'1.03.-03.03.2024'],
    ] as const){
      const masked=maskText(source,detectPII(source),{}, {dateShiftEnabled:true,offsetDays:offset});
      expect(masked.text,source).toBe(shifted);
      expect(masked.partialDates).toHaveLength(1);
      expect(masked.dates).toHaveLength(1);
      expect(restoredDateText(source,offset),source).toBe(source);
    }
  });

  it('restores independently when the AI omits, repeats or computes new endpoints',()=>{
    const source='06.01.-10.01.2025';
    const masked=maskText(source,detectPII(source),{}, {dateShiftEnabled:true,offsetDays:30});
    const reply='05.02.-09.02.2025, außerdem 06.03.-10.03.2025';
    const partial=restoreShiftedPartialDates(reply,masked.partialDates,{
      offsetDays:30,shiftedFullDates:masked.dates.map(date=>date.shiftedIso)
    });
    const full=restoreShiftedDates(partial.text,masked.dates.map(date=>date.shiftedIso),30);
    expect(full.text).toBe('06.01.-10.01.2025, außerdem 04.02.-08.02.2025');
    expect([...partial.warnings,...full.warnings]).toEqual([]);
    const omitted=restoreShiftedPartialDates('Keine Termine erwähnt',masked.partialDates);
    expect(omitted.text).toBe('Keine Termine erwähnt');
    expect(omitted.warnings).toEqual([]);
  });

  it('keeps normal phone detection and invalid date handling intact',()=>{
    expect(detectPII('Telefon 0421 12345678').some(hit=>hit.kind==='PHONE')).toBe(true);
    expect(scanDates('31.02.2025').matches).toEqual([]);
    expect(scanPartialDates('10.01.2025')).toEqual([]);
  });
});
