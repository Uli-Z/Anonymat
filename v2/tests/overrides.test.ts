import { describe,expect,it } from 'vitest';
import { detectPII, scanDocument } from '../src/lib/detect';
import { splitFullName } from '../src/lib/overrides';
import { maskText, restoreText } from '../src/lib/replace';

describe('manual classification overrides', () => {
  it('overrides PERSON with first and last names and propagates last name', () => {
    const source='Frau Anna Müller untersucht Müller.';
    const original=detectPII(source)[0];
    expect(original.kind).toBe('PERSON');
    const split=splitFullName(original);
    expect(split?.map(hit => hit.kind)).toEqual(['FIRST_NAME','LAST_NAME']);
    expect(split?.map(hit => hit.text)).toEqual(['Anna','Müller']);
    const hits=scanDocument(source, split!);
    expect(hits.map(hit => [hit.kind,hit.text])).toEqual([
      ['FIRST_NAME','Anna'], ['LAST_NAME','Müller'],['LAST_NAME','Müller']
    ]);
    const result=maskText(source,hits);
    expect(result.text).toContain('[FIRST_NAME_001] [LAST_NAME_001]');
    expect(result.text).toContain('untersucht [LAST_NAME_001]');
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });
  it('does not guess how to split particles or more than two words', () => {
    const hit=detectPII('Frau Anna Müller')[0];
    expect(splitFullName({...hit,text:'Anna von Müller',end:hit.start+15})).toBeNull();
  });
  it('does not split non-person entities', () => {
    const hit=detectPII('a@example.org')[0];
    expect(splitFullName(hit)).toBeNull();
  });
});
