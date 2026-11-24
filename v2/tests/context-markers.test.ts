import { describe, expect, it } from 'vitest';
import { scanContextMarkers } from '../src/lib/context-markers';
import { reviewDocument } from '../src/lib/session';
import { maskText, restoreText } from '../src/lib/replace';

describe('bracketed terms and slash signatures',()=>{
  it('automatically marks single bracketed terms, including unknown and Unicode words',()=>{
    const source='[Zorvex] [Ярова] [abc-12] [ABC] [zwei Wörter] [PERSON_001] [PATIENT_A]';
    const hits=scanContextMarkers(source);
    expect(hits.map(hit=>hit.text)).toEqual(['[Zorvex]','[Ярова]','[abc-12]','[ABC]']);
    expect(hits.every(hit=>hit.kind==='OTHER' && hit.confidence==='certain')).toBe(true);
    for(const hit of hits)expect(source.slice(hit.start,hit.start+hit.text.length)).toBe(hit.text);
  });

  it('suggests single or double slash signatures at line end, even without final newline',()=>{
    const source='Text /Schmidt\n//zorvex  \r\n  / Ярова\r\n//abc-12';
    const hits=scanContextMarkers(source);
    expect(hits.map(hit=>hit.text)).toEqual(['Schmidt','zorvex','Ярова','abc-12']);
    expect(hits.every(hit=>hit.kind==='LAST_NAME' && hit.confidence==='review')).toBe(true);
    for(const hit of hits)expect(source.slice(hit.start,hit.start+hit.text.length)).toBe(hit.text);
  });

  it('does not suggest ordinary joined alternatives, paths, ratios or mid-line slashes',()=>{
    const source='und/oder\nhttps://example.org/Schmidt\n/path/file\nmg/dL\n///Schmidt\n/Schmidt weiter\n12/30\n';
    expect(scanContextMarkers(source)).toEqual([]);
  });

  it('masks brackets immediately, but leaves a signature pending until confirmed',()=>{
    const source='[Zorvex]\n//qevron\n';
    const review=reviewDocument(source,[],[],[]);
    expect(review.active.map(hit=>hit.text)).toEqual(['[Zorvex]']);
    expect(review.pending.map(hit=>hit.text)).toEqual(['qevron']);
    const preview=maskText(source,review.active,{}, {},review.pending);
    expect(preview.text).toBe('[OTHER_001]\n//qevron\n');
    expect(preview.reviewSpans.map(hit=>hit.text)).toEqual(['qevron']);
    const confirmed=reviewDocument(source,[{...review.pending[0],origin:'manual',confidence:'certain'}],[],[]);
    const masked=maskText(source,confirmed.active);
    expect(masked.text).toBe('[OTHER_001]\n//[LAST_NAME_001]\n');
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
    expect(reviewDocument(source,[],[],[],'auto',true,[],{OTHER:false,LAST_NAME:false}).findings).toEqual([]);
  });
});
