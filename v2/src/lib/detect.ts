/**
 * Anonymat v2: deliberately modest, local pattern detection.
 * Results are suggestions, NEVER a guarantee of identifying all PII.
 */
export type Kind = 'PERSON' | 'EMAIL' | 'PHONE' | 'IBAN' | 'OTHER';

export interface Finding {
  id: string;
  kind: Kind;
  text: string;
  start: number;
  end: number;
  origin: 'automatic' | 'manual';
}

export const KIND_LABELS: Record<Kind, string> = {
  PERSON: 'Person',
  EMAIL: 'E-Mail',
  PHONE: 'Telefon',
  IBAN: 'IBAN',
  OTHER: 'Sonstiges'
};

function ibanValid(value: string): boolean {
  const compact = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  const moved = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of moved) {
    const expanded = char >= 'A' && char <= 'Z'
      ? String(char.charCodeAt(0) - 55)
      : char;
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function overlaps(a: Finding, b: Finding): boolean {
  return a.start < b.end && b.start < a.end;
}

export function detectPII(text: string): Finding[] {
  const results: Finding[] = [];
  function add(kind: Kind, start: number, value: string): void {
    if (!value.trim()) return;
    results.push({
      id: 'auto-' + kind + '-' + start + '-' + value.length,
      kind, text: value, start, end: start + value.length, origin: 'automatic'
    });
  }

  for (const match of text.matchAll(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g)) {
    add('EMAIL', match.index, match[0]);
  }
  // Explicit German/international phone prefixes to reduce accidental hits
  // on dates, blood pressure readings or other medical numbers.
  for (const match of text.matchAll(/(?<![\w\d])(?:\+49|0049|0[1-9])(?:[\s/()-]*\d){7,12}(?!\d)/g)) {
    add('PHONE', match.index, match[0].trimEnd());
  }
  for (const match of text.matchAll(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi)) {
    if (ibanValid(match[0])) add('IBAN', match.index, match[0]);
  }
  // Restrained name heuristic: salutation + capitalized name (not free-text NER).
  for (const match of text.matchAll(/\b(?:Herrn?|Frau)\s+(?:(?:Dr|Prof)\.\s+)*([A-ZÄÖÜ][\p{L}-]+(?:\s+[A-ZÄÖÜ][\p{L}-]+){0,2})/gu)) {
    const value = match[1];
    const offset = match[0].lastIndexOf(value);
    add('PERSON', match.index + offset, value);
  }

  return removeOverlaps(results);
}

export function removeOverlaps(findings: Finding[]): Finding[] {
  const ordered = [...findings].sort((a, b) =>
    (a.origin === 'manual' ? -1 : 1) - (b.origin === 'manual' ? -1 : 1)
    || (b.end - b.start) - (a.end - a.start)
    || a.start - b.start
  );
  const accepted: Finding[] = [];
  for (const item of ordered) {
    if (!accepted.some(other => overlaps(item, other))) accepted.push(item);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

export function mergeManual(auto: Finding[], manual: Finding[]): Finding[] {
  return removeOverlaps([...manual, ...auto]);
}
