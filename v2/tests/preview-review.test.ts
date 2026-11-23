import { describe,expect,it } from 'vitest';
import { maskText, splitForPreview, restoreText } from '../src/lib/replace';
import { reviewDocument } from '../src/lib/session';
import type { Finding } from '../src/lib/detect';

describe('unconfirmed proposals in the pseudonymized output',()=>{
  it('preserves exact output positions after a longer token and a shifted date',()=>{
    const source='Anna am 11.11.2026 traf Peter.';
    const nameStart=source.indexOf('Anna');
    const dateStart=source.indexOf('11.11.2026');
    const personStart=source.indexOf('Peter');
    const active:Finding[]=[
      {id:'name',origin:'manual',kind:'PERSON',start:nameStart,end:nameStart+4,text:'Anna'},
      {id:'date',origin:'automatic',kind:'DATE',start:dateStart,end:dateStart+10,text:'11.11.2026'}
    ];
    const review:Finding={id:'review',origin:'automatic',kind:'FIRST_NAME',
      start:personStart,end:personStart+5,text:'Peter',confidence:'review'};
    const masked=maskText(source,active,{}, {dateShiftEnabled:true,offsetDays:30},[review]);
    expect(masked.text).toMatch(/\[PERSON_001\].*Peter\.$/);
    expect(masked.text).not.toContain('11.11.2026');
    expect(masked.text.slice(masked.reviewSpans[0].start,masked.reviewSpans[0].end)).toBe('Peter');
    const parts=splitForPreview(masked.text,masked.reviewSpans);
    expect(parts.filter(part=>part.review).map(part=>part.value)).toEqual(['Peter']);
    expect(parts.filter(part=>part.token).map(part=>part.value)).toEqual(['[PERSON_001]']);
  });
  it('filters ignored proposals out of both output decorations and warnings',()=>{
    const source='Peter und Ulrich.';
    const reviewed=reviewDocument(source,[],[],['Peter']);
    expect(reviewed.pending.map(hit=>hit.text)).toEqual(['Ulrich']);
    const masked=maskText(source,reviewed.active,{}, {},reviewed.pending);
    expect(splitForPreview(masked.text,masked.reviewSpans).filter(part=>part.review).map(part=>part.value))
      .toEqual(['Ulrich']);
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
  });
});
