import { describe, expect, it } from 'vitest';
import { ChangeSet } from '@codemirror/state';
import { remapFindings } from '../src/lib/marks';
import type { Finding } from '../src/lib/detect';

const source = 'Frau Anna Müller.';
const mark: Finding = {
  id: 'manual-1', origin: 'manual', kind: 'PERSON',
  text: 'Anna Müller', start: 5, end: 16
};

describe('anchored marks survive document edits', () => {
  it('shifts a manual mark when text is inserted in front', () => {
    const changes = ChangeSet.of([{ from: 0, insert: 'Guten Tag ' }], source.length);
    const next = 'Guten Tag ' + source;
    expect(remapFindings([mark], changes, next)).toEqual([
      { ...mark, start: 15, end: 26 }
    ]);
  });
  it('does not change a manual mark when adding at the end', () => {
    const changes = ChangeSet.of([{ from: source.length, insert: ' Danke.' }], source.length);
    expect(remapFindings([mark], changes, source + ' Danke.')).toEqual([mark]);
  });
  it('updates the marked value when editing inside a manual mark', () => {
    const changes = ChangeSet.of([{ from: 9, to: 10, insert: '-' }], source.length);
    expect(remapFindings([mark], changes, 'Frau Anna-Müller.')[0].text).toBe('Anna-Müller');
  });
  it('drops only a fully deleted mark', () => {
    const changes = ChangeSet.of([{ from: 5, to: 16, insert: '' }], source.length);
    expect(remapFindings([mark], changes, 'Frau .')).toEqual([]);
  });
  it('keeps a local exception after editing elsewhere', () => {
    const changes = ChangeSet.of([{ from: 0, insert: 'Hallo ' }], source.length);
    expect(remapFindings([mark], changes, 'Hallo ' + source, 'exact')).toHaveLength(1);
  });
  it('rechecks ignored text when the ignored phrase changes', () => {
    const changes = ChangeSet.of([{ from: 9, to: 10, insert: '-' }], source.length);
    expect(remapFindings([mark], changes, 'Frau Anna-Müller.', 'exact')).toEqual([]);
  });
});
