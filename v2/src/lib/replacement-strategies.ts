import type { Kind } from './detect';

/**
 * Contract for a future rule-based replacement engine. Only 'token' and
 * 'custom-token' are currently executed; future modes must be activated
 * with explicit implementation and round-trip tests.
 */
export type ReplacementMode = 'token' | 'custom-token';
export type PlannedMode = 'shift-date' | 'shift-time' | 'synthetic-name' | 'synthetic-email';

export interface TokenRule {
  mode: 'token';
  kind: Kind;
}
export interface CustomTokenRule {
  mode: 'custom-token';
  kind: Kind;
  token: string;
}
export type ReplacementRule = TokenRule | CustomTokenRule;

/** Keys are normalized only for finding a rule; restoring still uses exact originals. */
export function replacementKey(kind: Kind, original: string): string {
  return kind + ':' + original.normalize('NFC').toLocaleLowerCase('de');
}

export function validateCustomToken(value: string): string | null {
  if (!/^\[[A-Z][A-Z0-9_]{2,63}\]$/.test(value)) {
    return 'Ersatzwert muss ein eindeutiger Token wie [PATIENT_A] sein.';
  }
  return null;
}
