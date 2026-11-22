import { describe, expect, it } from 'vitest';
import { reviewDocument } from '../src/lib/session';
import { maskText, restoreText } from '../src/lib/replace';
import { restoreShiftedDates } from '../src/lib/dates';
import { restoreShiftedPartialDates } from '../src/lib/partial-dates';
import type { Finding, Kind } from '../src/lib/detect-types';
import corpus from './fixtures/realistic-scenarios.json';

/**
 * Diagnostic, synthetic, real-world-style corpus.
 *
 * Its purpose is to make both leaks (missed sensitive spans) and noise
 * (ordinary words marked as personal data) visible. Known deficiencies are
 * measured, not silently redefined as acceptable behavior. The audit itself
 * does not turn CI red for every currently unsupported typo; separate
 * regression assertions below enforce safety properties already supported.
 */
type Expected = { text: string; kind: Kind; mode: 'active' | 'review'; occurrence?: number };
type Fixture = {
  id: string;
  category: string;
  text: string;
  expected: Expected[];
  forbidden: string[];
  numericOrder: 'auto' | 'DMY' | 'MDY';
};
type Span = Expected & { start: number; end: number };
const fixtures: Fixture[] = corpus.fixtures as Fixture[];

function occurrences(source: string, needle: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < source.length) {
    const at = source.indexOf(needle, start);
    if (at === -1) break;
    spans.push({ start: at, end: at + needle.length });
    start = at + needle.length;
  }
  return spans;
}

function goldSpans(f: Fixture): Span[] {
  const proposals = f.expected.flatMap(e =>
    occurrences(f.text, e.text)
      .filter((_,index) => e.occurrence === undefined || e.occurrence === index+1)
      .map(span => ({ ...e, ...span }))
  );
  // A "Vorname: Annna" annotation must not erroneously demand that
  // "Annna" inside the separately annotated "Annna Müller" be split.
  return proposals.filter(a => !proposals.some(b =>
    b !== a && b.start <= a.start && b.end >= a.end &&
    (b.start < a.start || b.end > a.end)
  )).sort((a,b) => a.start - b.start || b.end - a.end);
}

function exact(h: Finding, s: Span): boolean {
  return h.start === s.start && h.end === s.end && h.kind === s.kind;
}
function covered(h: Finding, s: Pick<Span,'start'|'end'>): boolean {
  return h.start <= s.start && h.end >= s.end;
}

describe('realistic anonymization corpus (synthetic audit)', () => {
  it('contains valid explicit targets and negatives in varied scenarios', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
    expect(new Set(fixtures.map(f => f.id)).size).toBe(fixtures.length);
    expect(new Set(fixtures.map(f => f.category)).size).toBeGreaterThanOrEqual(8);
    for (const f of fixtures) {
      expect(f.text.length, f.id).toBeGreaterThan(40);
      for (const target of [...f.expected.map(e => e.text), ...f.forbidden]) {
        expect(f.text.includes(target), f.id + ': target not in source: ' + target).toBe(true);
      }
    }
  });

  it('audits masking recall, exact types, review behavior, and false alarms', () => {
    const failures: Array<{
      case: string; category: string;
      missed: string[]; wrongType: string[];
      unexpectedMask: string[]; forbiddenMask: string[];
      unexpectedReview: string[]; missingReview: string[];
    }> = [];
    const summary = {
      scenarios: fixtures.length, expectedSpans: 0,
      protectedSpans: 0, exactCorrect: 0, reviewExpected: 0,
      reviewOffered: 0, unexpectedAutomaticMasks: 0,
      forbiddenMasks: 0, unexpectedReviewSuggestions: 0,
      unprotectedSensitiveSpans: 0, replacementRoundTrips: 0,
      failedRoundTrips: 0
    };
    for (const f of fixtures) {
      const gold = goldSpans(f);
      const result = reviewDocument(f.text, [], [], [], f.numericOrder);
      const active = result.active;
      const report = { case:f.id, category:f.category,
        missed:[] as string[],wrongType:[] as string[],
        unexpectedMask:[] as string[],forbiddenMask:[] as string[],
        unexpectedReview:[] as string[],missingReview:[] as string[] };

      summary.expectedSpans += gold.length;
      for (const s of gold) {
        const candidate = result.findings.find(hit => exact(hit,s));
        if (s.mode === 'review') {
          summary.reviewExpected++;
          if (candidate && candidate.confidence === 'review' && !active.some(hit => covered(hit,s)))
            summary.reviewOffered++;
          else report.missingReview.push(s.kind + ':' + s.text);
        } else {
          if (active.some(hit => covered(hit,s))) summary.protectedSpans++;
          else {
            summary.unprotectedSensitiveSpans++;
            report.missed.push(s.kind + ':' + s.text);
          }
          if (active.some(hit => exact(hit,s))) summary.exactCorrect++;
          else if (active.some(hit => covered(hit,s))) {
            report.wrongType.push(s.kind + ':' + s.text + ' -> ' +
              active.filter(hit => covered(hit,s)).map(hit => hit.kind).join(','));
          }
        }
      }

      for (const hit of active) {
        if (!gold.some(s => s.mode === 'active' && exact(hit,s))) {
          summary.unexpectedAutomaticMasks++;
          report.unexpectedMask.push(hit.kind + ':' + hit.text);
        }
      }
      for (const hit of result.findings.filter(h => h.confidence === 'review')) {
        if (!gold.some(s => s.mode === 'review' && exact(hit,s))) {
          summary.unexpectedReviewSuggestions++;
          report.unexpectedReview.push(hit.kind + ':' + hit.text);
        }
      }
      for (const word of f.forbidden) {
        const regions = occurrences(f.text,word);
        for (const r of regions) {
          // A word inside an expected address is not a forbidden ordinary-language use.
          if (gold.some(s => s.mode === 'active' && s.start <= r.start && s.end >= r.end))continue;
          if (active.some(h => covered(h,r))) {
            summary.forbiddenMasks++;
            report.forbiddenMask.push(word);
          }
        }
      }

      const masked = maskText(f.text, active);
      const restored = restoreText(masked.text, masked.mapping);
      if (restored.text === f.text && restored.missing.length === 0) summary.replacementRoundTrips++;
      else summary.failedRoundTrips++;

      if (Object.entries(report).some(([key,arr]) =>
        !['case','category'].includes(key) && Array.isArray(arr) && arr.length > 0
      )) failures.push(report);
    }

    // Machine-readable results appear in the CI unit-test log.
    console.info('ANONYMAT_REALISTIC_AUDIT_SUMMARY ' + JSON.stringify(summary));
    console.info('ANONYMAT_REALISTIC_AUDIT_FINDINGS ' + JSON.stringify(failures));
    // Enforce the audited baseline in CI, not only in printed diagnostics.
    const activeExpected=summary.expectedSpans-summary.reviewExpected;
    expect(summary.unprotectedSensitiveSpans, 'Sensitive text must not leak').toBe(0);
    expect(summary.protectedSpans).toBe(activeExpected);
    expect(summary.exactCorrect, 'Every protected span must retain its category and offsets').toBe(activeExpected);
    expect(summary.reviewOffered).toBe(summary.reviewExpected);
    expect(summary.unexpectedAutomaticMasks, 'Do not anonymize ordinary words').toBe(0);
    expect(summary.forbiddenMasks, 'Explicit non-PII phrases must remain intact').toBe(0);
    expect(summary.unexpectedReviewSuggestions).toBe(0);
    expect(summary.failedRoundTrips, 'Every active token mapping must restore the source').toBe(0);
    expect(summary.replacementRoundTrips).toBe(fixtures.length);
  });

  it('restores complete and incomplete dates after a fixed shift', () => {
    const broken: string[] = [];
    for (const f of fixtures) {
      const result = reviewDocument(f.text,[],[],[],f.numericOrder);
      const out = maskText(f.text,result.active,{},{
        dateShiftEnabled:true,offsetDays:30,numericOrder:f.numericOrder
      });
      const partial = restoreShiftedPartialDates(out.text,out.partialDates);
      const full = restoreShiftedDates(partial.text,out.dates.map(d=>d.shiftedIso),30,
        {numericOrder:f.numericOrder});
      const restored = restoreText(full.text,out.mapping);
      if (restored.text !== f.text) broken.push(f.id);
    }
    console.info('ANONYMAT_REALISTIC_DATE_ROUNDTRIP ' + JSON.stringify({
      cases:fixtures.length,failures:broken
    }));
    expect(broken).toEqual([]);
  });

  it('never masks institution names in the two hospital-negative examples', () => {
    for (const id of ['hospital-no-address','long-hospital-narrative']) {
      const f = fixtures.find(item => item.id === id)!;
      const active = reviewDocument(f.text,[],[],[],f.numericOrder).active;
      expect(active.filter(hit => hit.text.toLocaleLowerCase('de').includes('krankenhaus')),
        id).toEqual([]);
    }
  });
});
