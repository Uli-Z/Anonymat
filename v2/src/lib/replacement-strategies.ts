import type { Kind } from './detect';

/**
 * Explicit per-term strategies. Synthetic values are generated locally from bundled lexica
 * and kept in the same reversible ledger as custom placeholders.
 */
export type ReplacementMode = 'token' | 'custom-token' | 'shift-date' | 'synthetic';
export type PlannedMode = 'shift-time' | 'synthetic-email';

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
export interface SyntheticRule { mode:'synthetic'; kind:Kind }
export type ReplacementRule = TokenRule | CustomTokenRule | ShiftDateRule | SyntheticRule;

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
