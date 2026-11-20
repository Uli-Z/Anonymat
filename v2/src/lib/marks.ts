import type { ChangeDesc } from '@codemirror/state';
import type { Finding } from './detect';

/**
 * Map user decisions through CodeMirror's exact edit changes.
 * An insertion before a mark shifts it; an insertion inside a manual mark
 * expands it. Boundary insertions belong to surrounding text, not the mark.
 * Fully deleted/replaced marks are dropped.
 *
 * Exact exclusions are removed if their text is edited, so altered content
 * is scanned again instead of inheriting a stale "ignore" decision.
 */
export function remapFindings(
  entries: readonly Finding[],
  changes: ChangeDesc,
  newText: string,
  mode: 'manual' | 'exact' = 'manual'
): Finding[] {
  const result: Finding[] = [];
  for (const entry of entries) {
    const start = changes.mapPos(entry.start, 1);
    const end = changes.mapPos(entry.end, -1);
    if (start < 0 || end > newText.length || end <= start) continue;
    const actual = newText.slice(start, end);
    if (!actual.trim()) continue;
    if (mode === 'exact' && actual !== entry.text) continue;
    result.push({ ...entry, start, end, text: actual });
  }
  return result;
}

export function spansOverlap(
  a: Pick<Finding, 'start' | 'end'>,
  b: Pick<Finding, 'start' | 'end'>
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function sameTerm(a: string, b: string): boolean {
  return a.normalize('NFC').toLocaleLowerCase('de') === b.normalize('NFC').toLocaleLowerCase('de');
}
