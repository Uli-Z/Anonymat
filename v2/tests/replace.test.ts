import { describe, expect, it } from 'vitest';
import { detectPII, type Finding } from '../src/lib/detect';
import { maskText, restoreText } from '../src/lib/replace';

describe('local pseudonymization', () => {
  it('replaces and restores exact tokens', () => {
    const source = 'Hallo Frau Anna Müller, anna@example.org';
    const masked = maskText(source, detectPII(source));
    expect(masked.text).toContain('[PERSON_001]');
    expect(masked.text).toContain('[EMAIL_001]');
    const restored = restoreText(masked.text, masked.mapping);
    expect(restored.text).toBe(source);
    expect(restored.missing).toEqual([]);
  });
  it('reuses one token for repeated identical originals', () => {
    const source = 'a@example.org und a@example.org';
    const masked = maskText(source, detectPII(source));
    expect(masked.text).toBe('[EMAIL_001] und [EMAIL_001]');
    expect(masked.mapping).toHaveLength(1);
  });
  it('reports altered tokens rather than inventing values', () => {
    const mapping = [{ token: '[PERSON_001]', original: 'Anna Müller', kind: 'PERSON' as const }];
    const restored = restoreText('Bonjour [PERSON_002]', mapping);
    expect(restored.text).toBe('Bonjour [PERSON_002]');
    expect(restored.missing).toEqual(['[PERSON_001]']);
    expect(restored.unknown).toEqual(['[PERSON_002]']);
  });
  it('handles manually selected text', () => {
    const source = 'Eine interne Referenz';
    const mark: Finding = { id: 'manual-1', origin: 'manual', kind: 'OTHER', text: source.slice(5), start: 5, end: source.length };
    const result = maskText(source, [mark]);
    expect(result.text).toBe('Eine [OTHER_001]');
    expect(restoreText(result.text, result.mapping).text).toBe(source);
  });
});
