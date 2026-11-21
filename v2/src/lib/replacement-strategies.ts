import type { Kind } from './detect';

/**
 * Contract for a future rule-based replacement engine. Token, custom-token and shift-date are executed; future modes must be activated
 * with explicit implementation and round-trip tests.
 */
export type ReplacementMode = 'token' | 'custom-token' | 'shift-date';
export type PlannedMode = 'shift-time' | 'synthetic-name' | 'synthetic-email';

export interface TokenRule {
  mode: 'token';
  kind: Kind;
}
export interface CustomTokenRule {
  mode: 'custom-token';
  kind: Kind;
  token: string;
}
export interface ShiftDateRule { mode:'shift-date'; kind:'DATE' }
export type ReplacementRule = TokenRule | CustomTokenRule | ShiftDateRule;

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
