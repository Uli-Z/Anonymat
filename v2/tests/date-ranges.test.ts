import {describe,expect,it} from 'vitest';
import {scanDateRanges,parseDateRange,shiftDateRange,restoreShiftedDates} from '../src/lib/dates';
import {scanPartialDates} from '../src/lib/partial-dates';
import {detectPII} from '../src/lib/detect';
import {maskText,restoreText} from '../src/lib/replace';

describe('abbreviated German date intervals',()=>{
  it('recognizes the exact reported date range and common dash styles as one match',()=>{
    for(const source of ['06.01.-10.01.2025','06.01. – 10.01.2025','6.1.–10.1.2025']){
      expect(scanDateRanges(source)).toHaveLength(1);
      expect(detectPII(source).filter(hit=>hit.kind==='DATE').map(hit=>hit.text)).toEqual([source]);
      expect(scanPartialDates(source)).toEqual([]);
    }
    expect(parseDateRange('06.01.-10.01.2025')).toMatchObject({
      startIso:'2025-01-06',endIso:'2025-01-10'
    });
  });
  it('uniformly shifts and restores an atomic date interval',()=>{
    const source='Vom 06.01.-10.01.2025 fand die Behandlung statt.';
    const masked=maskText(source,detectPII(source),{}, {dateShiftEnabled:true,offsetDays:30});
    expect(masked.text).toBe('Vom 05.02.-09.02.2025 fand die Behandlung statt.');
    expect(masked.dates).toHaveLength(1);
    expect(masked.dates[0].shiftedIso).toBe('2025-02-09');
    expect(masked.replacementSpans).toHaveLength(1);
    const back=restoreShiftedDates(masked.text,masked.dates.map(entry=>entry.shiftedIso),30);
    expect(back.text).toBe(source);
    expect(back.warnings).toEqual([]);
    expect(restoreText(back.text,masked.mapping).text).toBe(source);
  });
  it('infers the first endpoint year across New Year',()=>{
    const range=parseDateRange('29.12.-02.01.2025');
    expect(range?.startIso).toBe('2024-12-29');
    expect(range?.endIso).toBe('2025-01-02');
    expect(shiftDateRange(range!,30)).toBe('28.01.-01.02.2025');
  });
  it('also inversely translates newly calculated date intervals in an AI answer',()=>{
    const reply='Die Kontrolle ist vom 06.03.-10.03.2025 vorgesehen.';
    const restored=restoreShiftedDates(reply,['2025-02-09'],30);
    expect(restored.text).toBe('Die Kontrolle ist vom 04.02.-08.02.2025 vorgesehen.');
    expect(restored.warnings).toEqual([]);
  });
  it('rejects impossible dates rather than inventing a shifted range',()=>{
    expect(scanDateRanges('30.02.-10.03.2025')).toEqual([]);
    expect(scanDateRanges('06.01.-31.02.2025')).toEqual([]);
  });
});
