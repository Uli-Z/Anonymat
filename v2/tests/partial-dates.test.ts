import {describe,it,expect} from 'vitest';
import {detectPII} from '../src/lib/detect';
import {maskText,restoreText} from '../src/lib/replace';
import {restoreShiftedDates} from '../src/lib/dates';
import {
  scanPartialDates,parsePartialDate,partialOriginalIso,formatPartialLike,restoreShiftedPartialDates
} from '../src/lib/partial-dates';

describe('partial date recognition and safety',()=>{
  it('detects day/month without a year in four languages',()=>{
    for(const [text,day,month,language] of [
      ['10. März',10,3,'de'],['10.03.',10,3,'de'],
      ['March 10',10,3,'en'],['10 mars',10,3,'fr'],['10 de marzo',10,3,'es'],
      ['Mar 10',10,3,'en'],['10 févr.',10,2,'fr']
    ] as const){
      const parsed=parsePartialDate(text);
      expect(parsed?.precision,text).toBe('day-month');
      expect(parsed?.day,text).toBe(day);
      expect(parsed?.month,text).toBe(month);
      expect(parsed?.language,text).toBe(language);
    }
  });
  it('detects month/year and context-bound month-only without assigning a day',()=>{
    const values=['März 2026','March 2026','mars 2026','marzo de 2026',
      '03/2026','2026-03','im März','in March','en mars','en marzo'];
    expect(values.map(text=>parsePartialDate(text)?.precision)).toEqual([
      'month-year','month-year','month-year','month-year',
      'month-year','month-year',undefined,undefined,undefined,undefined
    ]);
    for(const source of ['im März','in March','en mars','en marzo']){
      const found=scanPartialDates(source);
      expect(found).toHaveLength(1);
      expect(found[0].precision).toBe('month-only');
    }
  });
  it('never detects bare decimal values, ratios, years or laboratory measurements',()=>{
    for(const source of ['Hb 10.03 mg/dl','BD 120/80','10.03','10/03','2026','pH 7.45']){
      expect(scanPartialDates(source)).toEqual([]);
    }
    expect(detectPII('BD 120/80 und Hb 10.03 mg/dl')).toEqual([]);
  });
  it('does not split complete dates or mark the month within an existing complete date',()=>{
    for(const source of ['10.03.2026','10. März 2026','March 10, 2026','31.02.2026']){
      expect(scanPartialDates(source),source).toEqual([]);
    }
  });
  it('marks ambiguous contextual day/month for tokenisation, not guessing',()=>{
    const hit=scanPartialDates('Termin am 04/05.')[0];
    expect(hit?.precision).toBe('ambiguous');
    expect(hit?.reason).toContain('nicht eindeutig');
    const withOrder=scanPartialDates('Termin am 04/05.',{numericOrder:'DMY'})[0];
    expect(withOrder.precision).toBe('day-month');
    expect(withOrder.day).toBe(4);
    expect(withOrder.month).toBe(5);
    const us=scanPartialDates('On 04/15.',{numericOrder:'MDY'})[0];
    expect(us.month).toBe(4);
    expect(us.day).toBe(15);
  });
  it('tokenises partial dates by default, even when full dates are shifted',()=>{
    const source='Am 10. März; im April 2026; am 10.03.; 10.03.2026.';
    const found=detectPII(source);
    expect(found.filter(hit=>hit.kind==='DATE')).toHaveLength(4);
    const masked=maskText(source,found,{}, {dateShiftEnabled:true,offsetDays:30});
    expect(masked.text).toContain('[DATE_001]');
    expect(masked.text).toContain('[DATE_002]');
    expect(masked.text).toContain('[DATE_003]');
    expect(masked.text).toContain('09.04.2026');
    expect(masked.partialDates).toEqual([]);
    expect(restoreText(masked.text,masked.mapping).text).toBe(source.replace('10.03.2026','09.04.2026'));
  });
  it('shifts day/month without year using the same fixed day offset and explicit year',()=>{
    const source='10. März; March 10; 10 mars; 10 de marzo; 10.03.';
    const masked=maskText(source,detectPII(source),{}, {
      dateShiftEnabled:true,offsetDays:30,partialReferenceYear:2026
    });
    expect(masked.text).toBe('9. April; April 9; 9 avril; 9 de abril; 09.04.');
    expect(masked.partialDates).toHaveLength(5);
    const restored=restoreShiftedPartialDates(masked.text,masked.partialDates);
    expect(restored.text).toBe(source);
    expect(restored.warnings).toEqual([]);
  });
  it('restores translated French/English/Spanish partial dates and leaves unknown entries unchanged',()=>{
    const source='10. März am Morgen.';
    const masked=maskText(source,detectPII(source),{}, {
      dateShiftEnabled:true,offsetDays:30,partialReferenceYear:2026
    });
    for(const [reply,expected] of [
      ['9 avril, puis 2 mai','10 mars, puis 2 mai'],
      ['April 9; June 1','March 10; June 1'],
      ['9 de abril y 3 de mayo','10 de marzo y 3 de mayo']
    ]){
      const restored=restoreShiftedPartialDates(reply,masked.partialDates);
      expect(restored.text).toBe(expected);
      expect(restored.warnings).toHaveLength(1);
    }
  });
  it('detects missing or duplicated occurrences and never restores extra copies',()=>{
    const source='10. März';
    const masked=maskText(source,detectPII(source),{}, {
      dateShiftEnabled:true,offsetDays:30,partialReferenceYear:2026
    });
    const repeated=restoreShiftedPartialDates('9 avril et 9 avril',masked.partialDates);
    expect(repeated.text).toBe('10 mars et 9 avril');
    expect(repeated.warnings).toHaveLength(1);
    const missing=restoreShiftedPartialDates('Sans date',masked.partialDates);
    expect(missing.text).toBe('Sans date');
    expect(missing.warnings[0]).toContain('fehlt');
  });
  it('checks leap days against reference year and handles year crossings',()=>{
    const feb=parsePartialDate('29. Februar')!;
    expect(partialOriginalIso(feb,null)).toBeNull();
    expect(partialOriginalIso(feb,2025)).toBeNull();
    expect(partialOriginalIso(feb,2024)).toBe('2024-02-29');
    const source='31. Dezember und 2. Januar';
    const masked=maskText(source,detectPII(source),{}, {
      dateShiftEnabled:true,offsetDays:30,partialReferenceYear:2026
    });
    expect(masked.text).toBe('30. Januar und 1. Februar');
    expect(restoreShiftedPartialDates(masked.text,masked.partialDates).text).toBe(source);
  });
  it('does not infer a month-year day or shift such periods even with a reference year',()=>{
    const source='März 2026, 03/2026, im März';
    const masked=maskText(source,detectPII(source),{}, {
      dateShiftEnabled:true,offsetDays:30,partialReferenceYear:2026
    });
    expect(masked.dates).toHaveLength(0);
    expect(masked.partialDates).toHaveLength(0);
    expect(masked.mapping).toHaveLength(3);
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
  });
  it('maintains the mixed full-date/yearless-date/token reverse order',()=>{
    const source='10.03.2026, 10. März und März 2026.';
    const masked=maskText(source,detectPII(source),{}, {
      dateShiftEnabled:true,offsetDays:30,partialReferenceYear:2026
    });
    expect(masked.dates).toHaveLength(1);
    expect(masked.partialDates).toHaveLength(1);
    expect(masked.mapping).toHaveLength(1);
    const intermediate=restoreShiftedPartialDates(masked.text,masked.partialDates);
    const full=restoreShiftedDates(intermediate.text,masked.dates.map(date=>date.shiftedIso),30);
    expect(restoreText(full.text,masked.mapping).text).toBe(source);
  });
  it('preserves format for abbreviated months, numeric dates and uppercase spelling',()=>{
    const short=parsePartialDate('10. Mrz.')!;
    expect(formatPartialLike('2026-04-09',short)).toBe('9. Apr.');
    const english=parsePartialDate('Mar 10')!;
    expect(formatPartialLike('2026-04-09',english)).toBe('Apr 9');
  });
});
