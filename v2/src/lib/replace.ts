import type { Finding, Kind } from './detect';

export interface MappingEntry {
  token: string;
  original: string;
  kind: Kind;
}

export interface MaskedResult {
  text: string;
  mapping: MappingEntry[];
}

export interface RestoredResult {
  text: string;
  missing: string[];
  unknown: string[];
}

export function maskText(source: string, active: Finding[]): MaskedResult {
  const matches = [...active].sort((a, b) => a.start - b.start);
  const counts: Partial<Record<Kind, number>> = {};
  const existing = new Map<string, string>();
  const mapping: MappingEntry[] = [];
  let pos = 0;
  let text = '';

  for (const match of matches) {
    if (match.start < pos || source.slice(match.start, match.end) !== match.text) continue;
    const key = match.kind + ':' + match.text;
    let token = existing.get(key);
    if (!token) {
      counts[match.kind] = (counts[match.kind] ?? 0) + 1;
      token = '[' + match.kind + '_' + String(counts[match.kind]).padStart(3, '0') + ']';
      // Avoid accidental collision with a literal placeholder in source.
      while (source.includes(token)) {
        counts[match.kind] = (counts[match.kind] ?? 0) + 1;
        token = '[' + match.kind + '_' + String(counts[match.kind]).padStart(3, '0') + ']';
      }
      existing.set(key, token);
      mapping.push({ token, original: match.text, kind: match.kind });
    }
    text += source.slice(pos, match.start) + token;
    pos = match.end;
  }
  return { text: text + source.slice(pos), mapping };
}

export function restoreText(input: string, mapping: MappingEntry[]): RestoredResult {
  const lookup = new Map(mapping.map(entry => [entry.token, entry.original]));
  const seen = new Set<string>();
  const unknown: string[] = [];
  // Replace tokens in one pass: restored values must not be searched again.
  const text = input.replace(/\[(?:PERSON|EMAIL|PHONE|IBAN|OTHER)_\d{3,}\]/g, token => {
    if (lookup.has(token)) {
      seen.add(token);
      return lookup.get(token)!;
    }
    if (!unknown.includes(token)) unknown.push(token);
    return token;
  });
  return {
    text,
    missing: mapping.filter(entry => !seen.has(entry.token)).map(entry => entry.token),
    unknown
  };
}

export interface PreviewPart {
  value: string;
  token: boolean;
}

export function splitForPreview(value: string): PreviewPart[] {
  const parts: PreviewPart[] = [];
  let last = 0;
  for (const match of value.matchAll(/\[(?:PERSON|EMAIL|PHONE|IBAN|OTHER)_\d{3,}\]/g)) {
    if (match.index > last) parts.push({ value: value.slice(last, match.index), token: false });
    parts.push({ value: match[0], token: true });
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push({ value: value.slice(last), token: false });
  return parts;
}
