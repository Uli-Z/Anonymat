import { describe, expect, it } from 'vitest';
import { detectPII, mergeManual, type Finding } from '../src/lib/detect';

describe('simple PII suggestions', () => {
  it('detects email addresses', () => {
    const hits = detectPII('Kontakt: anna@example.org');
    expect(hits.map(hit => hit.kind)).toEqual(['EMAIL']);
    expect(hits[0].text).toBe('anna@example.org');
  });
  it('detects valid IBAN and rejects wrong checksum', () => {
    expect(detectPII('DE89370400440532013000').map(hit => hit.kind)).toEqual(['IBAN']);
    expect(detectPII('DE00370400440532013000')).toEqual([]);
  });
  it('detects a name after a salutation', () => {
    const hits = detectPII('Guten Tag Frau Anna Müller.');
    expect(hits.some(hit => hit.text === 'Anna Müller' && hit.kind === 'PERSON')).toBe(true);
  });
  it('does not mask medical values as telephone numbers', () => {
    expect(detectPII('Hb 8,2 g/dl, Blutdruck 110/65 mmHg, 2026-11-20')).toEqual([]);
  });
  it('prefers a manual mark over an overlapping automatic mark', () => {
    const text = 'Frau Anna Müller.';
    const automatic = detectPII(text);
    const manual: Finding = {id: 'm1', origin: 'manual', kind: 'OTHER', text: 'Anna', start: 5, end: 9};
    expect(mergeManual(automatic, [manual])).toEqual([manual]);
  });
});
