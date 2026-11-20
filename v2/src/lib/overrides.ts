import type { Finding, Kind } from './detect';

/**
 * Explicit classification rule: the user may replace an automatic PERSON
 * proposal with more precise FIRST_NAME/LAST_NAME annotations.
 * Both outputs are ordinary manual anchors and survive CodeMirror edits.
 */
export function splitFullName(hit: Finding): [Finding, Finding] | null {
  if (hit.kind !== 'PERSON') return null;
  const parts = [...hit.text.matchAll(/\S+/gu)];
  if (parts.length !== 2 || !parts[0][0] || !parts[1][0]) return null;
  const [first,last] = parts;
  if (!/^\p{L}[\p{L}\p{M}'-]*$/u.test(first[0]) ||
      !/^\p{L}[\p{L}\p{M}'-]*$/u.test(last[0])) return null;
  function anchor(part: RegExpMatchArray, kind: Kind, role: string): Finding {
    const start = hit.start + part.index!;
    return {
      id: 'split-' + role + '-' + hit.id, origin: 'manual',
      kind, text: part[0], start, end: start + part[0].length
    };
  }
  return [
    anchor(first,'FIRST_NAME','first'),
    anchor(last,'LAST_NAME','last')
  ];
}
