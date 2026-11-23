import {describe,expect,it} from 'vitest';
import {detectPII} from '../src/lib/detect';
import {maskText,restoreText} from '../src/lib/replace';
import {
  scanDates,parseDate,formatLike,formatIsoDate,shiftIsoDay,
  restoreShiftedDates,randomDateOffset,calendarDayDifference
} from '../src/lib/dates';
import {replacementKey} from '../src/lib/replacement-strategies';
import fixtures from './fixtures/translation/future-date-cases.json';

describe('calendar-day offset: four-language translation fixtures',()=>{
  for(const fixture of fixtures){
    it(fixture.id+' roundtrip in de/en/fr/es',()=>{
      const source=parseDate(fixture.source);
      expect(source).not.toBeNull();
      const shiftedIso=shiftIsoDay(source!.iso,fixture.offsetDays);
      expect(shiftedIso).not.toBeNull();
      expect(formatLike(shiftedIso!,source!)).toBe(fixture.shifted.de);
      for(const language of ['de','en','fr','es'] as const){
        const formatted=language==='de'?fixture.shifted.de:formatIsoDate(shiftedIso!,language);
        expect(formatted).toBe(fixture.shifted[language]);
        const parsed=parseDate(formatted);
        expect(parsed?.iso).toBe(shiftedIso);
        const restored=restoreShiftedDates(formatted,[shiftedIso!],fixture.offsetDays);
        expect(restored.warnings).toEqual([]);
        expect(restored.changed).toBe(1);
        expect(restored.text).toBe(fixture.restored[language]);
      }
    });
  }
});

describe('date safety and contextual behavior',()=>{
  it('preserves intervals, leap days and year boundaries using UTC days',()=>{
    const source='10.03.2026 bis 15.03.2026; 29.02.2024; 31.12.2026';
    const result=maskText(source,detectPII(source),{}, {dateShiftEnabled:true,offsetDays:30});
    expect(result.dates).toHaveLength(4);
    expect(shiftIsoDay(result.dates[0].shiftedIso,-30)).toBe('2026-03-10');
    expect(shiftIsoDay(result.dates[1].shiftedIso,-30)).toBe('2026-03-15');
    expect(result.text).toContain('09.04.2026 bis 14.04.2026');
    const back=restoreShiftedDates(result.text,result.dates.map(x=>x.shiftedIso),30);
    expect(back.text).toBe(source);
    expect(back.warnings).toEqual([]);
  });
  it('keeps weekday synchronized in all four languages',()=>{
    const expressions=[
      ['Dienstag, 10. März 2026','Donnerstag, 9. April 2026'],
      ['Tuesday, March 10, 2026','Thursday, April 9, 2026'],
      ['mardi 10 mars 2026','jeudi 9 avril 2026'],
      ['martes, 10 de marzo de 2026','jueves, 9 de abril de 2026']
    ];
    for(const [input,expected] of expressions){
      const parsed=parseDate(input);
      expect(parsed?.iso,input).toBe('2026-03-10');
      expect(formatLike('2026-04-09',parsed!)).toBe(expected);
      expect(restoreShiftedDates(expected,['2026-04-09'],30).text).toBe(input);
    }
  });
  it('rejects contradictory weekdays and invalid dates with warnings',()=>{
    expect(scanDates('Montag, 10.03.2026').issues[0]?.reason).toContain('Wochentag');
    expect(scanDates('31.02.2026').issues[0]?.reason).toContain('Ungültiger');
    expect(scanDates('29.02.2024').matches).toHaveLength(1);
    expect(scanDates('29.02.2025').matches).toHaveLength(0);
  });
  it('does not guess the ordering of ambiguous slash or dash dates',()=>{
    expect(scanDates('04/05/2026').matches).toHaveLength(0);
    expect(scanDates('04/05/2026').issues).toHaveLength(1);
    expect(parseDate('04/05/2026',{numericOrder:'DMY'})?.iso).toBe('2026-05-04');
    expect(parseDate('04/05/2026',{numericOrder:'MDY'})?.iso).toBe('2026-04-05');
    expect(parseDate('13/04/2026')?.iso).toBe('2026-04-13');
    expect(parseDate('04/13/2026')?.iso).toBe('2026-04-13');
  });
  it('does not recognize incomplete or relative dates as safe to shift',()=>{
    for(const value of ['10. März','April 2026','vor zwei Wochen','12:30']){
      expect(scanDates(value).matches).toEqual([]);
    }
  });
  it('detects full dates alongside names without disturbing medical measurements',()=>{
    const findings=detectPII('Hb 8,2 g/dl, Blutdruck 110/65 mmHg, 2026-11-20. Frau Müller.');
    expect(findings.map(hit=>hit.kind)).toEqual(['DATE','PERSON']);
  });
  it('keeps normal tokens and individual date overrides functional',()=>{
    const source='Frau Müller: 10.03.2026 und 11.03.2026.';
    const all=detectPII(source);
    const rules={
      [replacementKey('DATE','11.03.2026')]:{mode:'token' as const,kind:'DATE' as const}
    };
    const result=maskText(source,all,rules,{dateShiftEnabled:true,offsetDays:30});
    expect(result.text).toContain('09.04.2026');
    expect(result.text).toContain('[DATE_001]');
    expect(result.text).toContain('[PERSON_001]');
    const afterDates=restoreShiftedDates(result.text,result.dates.map(d=>d.shiftedIso),30);
    expect(restoreText(afterDates.text,result.mapping).text).toBe(source);
  });
  it('can shift just one DATE rule without enabling global shifting',()=>{
    const source='10.03.2026 und 11.03.2026';
    const rules={
      [replacementKey('DATE','10.03.2026')]:{mode:'shift-date' as const,kind:'DATE' as const}
    };
    const result=maskText(source,detectPII(source),rules,{offsetDays:30});
    expect(result.text).toBe('09.04.2026 und [DATE_001]');
  });
  it('restores new AI-derived dates but leaves ambiguous formats untouched',()=>{
    const source='10.03.2026';
    const masked=maskText(source,detectPII(source),{}, {dateShiftEnabled:true,offsetDays:30});
    const translated='9 avril 2026, mais aussi 2 mai 2026.';
    const restored=restoreShiftedDates(translated,masked.dates.map(d=>d.shiftedIso),30);
    expect(restored.text).toBe('10 mars 2026, mais aussi 2 avril 2026.');
    expect(restored.warnings).toEqual([]);
    const ambiguous=restoreShiftedDates('04/09/2026',masked.dates.map(d=>d.shiftedIso),30);
    expect(ambiguous.text).toBe('04/09/2026');
    expect(ambiguous.warnings.some(w=>w.includes('Mehrdeutiges'))).toBe(true);
    const explicit=restoreShiftedDates('04/09/2026',masked.dates.map(d=>d.shiftedIso),30,{numericOrder:'MDY'});
    expect(explicit.text).toBe('03/10/2026');
    expect(explicit.warnings).toEqual([]);
  });
  it('restores brand-new dates when a partial-date ledger establishes the offset',()=>{
    const restored=restoreShiftedDates('15.05.2026',[],30,{restoreDerivedDates:true});
    expect(restored.text).toBe('15.04.2026');
    expect(restored.warnings).toEqual([]);
  });
  it('falls back to tokens and warnings for invalid manually marked dates',()=>{
    const source='31.02.2026';
    const findings=[{id:'m',origin:'manual' as const,kind:'DATE' as const,text:source,start:0,end:source.length}];
    const result=maskText(source,findings,{}, {dateShiftEnabled:true,offsetDays:30});
    expect(result.text).toBe('[DATE_001]');
    expect(result.dates).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('derives a single offset from an edited replacement date',()=>{
    expect(calendarDayDifference('2026-03-10','2026-04-09')).toBe(30);
    expect(calendarDayDifference('2024-02-29','2024-03-01')).toBe(1);
  });
  it('restores repeated dates and permits omitting original dates',()=>{
    const duplicated=restoreShiftedDates('9 avril 2026, 9 avril 2026',['2026-04-09'],30);
    expect(duplicated.text).toBe('10 mars 2026, 10 mars 2026');
    expect(duplicated.warnings).toEqual([]);
    const absent=restoreShiftedDates('Pas de date.',['2026-04-09'],30);
    expect(absent.text).toBe('Pas de date.');
    expect(absent.warnings).toEqual([]);
    expect(restoreShiftedDates('2 mai 2026',[],30).text).toBe('2 mai 2026');
  });
  it('warns about ambiguous dates even when shifting is not enabled',()=>{
    const masked=maskText('04/05/2026',detectPII('04/05/2026'));
    expect(masked.text).toBe('04/05/2026');
    expect(masked.warnings[0]).toContain('Mehrdeutiges');
  });
  it('refuses out-of-range offsets rather than silently using them',()=>{
    const text='10.03.2026';
    const masked=maskText(text,detectPII(text),{}, {dateShiftEnabled:true,offsetDays:10000});
    expect(masked.text).toBe('[DATE_001]');
    expect(masked.warnings.length).toBeGreaterThan(0);
  });
  it('uses secure nonzero random offsets',()=>{
    for(let i=0;i<10;i++){
      const offset=randomDateOffset();
      expect(Number.isInteger(offset)).toBe(true);
      expect(Math.abs(offset)).toBeGreaterThanOrEqual(30);
      expect(Math.abs(offset)).toBeLessThanOrEqual(365);
    }
  });
});
