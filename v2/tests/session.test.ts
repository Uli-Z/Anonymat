import { describe, expect, it } from 'vitest';
import { detectPII, scanDocument, type Finding } from '../src/lib/detect';
import { reviewDocument } from '../src/lib/session';
import { maskText, restoreText } from '../src/lib/replace';

describe('document-wide learned terms and clear ignore semantics',()=>{
  it('learns Müller from Frau Müller, including later occurrences but not partial words',()=>{
    const source='Frau Müller kommt. Müller geht. Müllerei bleibt.';
    const hits=detectPII(source);
    expect(hits.map(hit=>hit.text)).toEqual(['Müller','Müller']);
    const masked=maskText(source,hits);
    expect(masked.text).toBe('Frau [PERSON_001] kommt. [PERSON_001] geht. Müllerei bleibt.');
    expect(restoreText(masked.text,masked.mapping).text).toBe(source);
  });
  it('recognizes full name and later surname independently',()=>{
    const hits=detectPII('Frau Anna Müller berichtet. Müller antwortet.');
    expect(hits.map(hit=>hit.text)).toEqual(['Anna Müller','Müller']);
  });
  it('learns same term throughout document from a manual mark',()=>{
    const source='Alpha und Alpha. Alphabet bleibt.';
    const anchor:Finding={id:'manual-1',origin:'manual',kind:'OTHER',text:'Alpha',start:0,end:5};
    const hits=scanDocument(source,[anchor]);
    expect(hits.map(hit=>hit.text)).toEqual(['Alpha','Alpha']);
    expect(hits[0].id).toBe('manual-1');
  });
  it('local exclusion hides only one match without extra bogus list entries',()=>{
    const source='Frau Müller, Müller, Müller.';
    const found=detectPII(source);
    expect(found).toHaveLength(3);
    const reviewed=reviewDocument(source,[],[{...found[1],id:'exclude-1'}],[]);
    expect(reviewed.findings).toHaveLength(3);
    expect(reviewed.groups).toHaveLength(1);
    expect(reviewed.groups[0]).toMatchObject({text:'Müller',count:3,activeCount:2});
  });
  it('global exclusion hides every match, independent of casing',()=>{
    const reviewed=reviewDocument('Frau Müller und Müller. Müllerei bleibt.',[],[],['mÜllEr']);
    expect(reviewed.active).toHaveLength(0);
    expect(reviewed.groups[0]).toMatchObject({count:2,activeCount:0});
  });
  it('keeps medical measurements as non-PII',()=>{
    expect(detectPII('Hb 8,2 g/dl, 110/65 mmHg, Na 140 mmol/l.')).toHaveLength(0);
  });

  it('recognizes earlier surnames when the context occurs later', () => {
    const hits=detectPII('Müller war da. Danach kam Frau Müller.');
    expect(hits.map(hit=>hit.text)).toEqual(['Müller','Müller']);
  });
  it('learns manually selected literal brackets rather than regex syntax', () => {
    const source='Kundin [ABC] und [ABC] aber [ABCD] bleibt.';
    const start=source.indexOf('[ABC]');
    const anchor:Finding={id:'manual-3',origin:'manual',kind:'OTHER',text:'[ABC]',start,end:start+5};
    const hits=scanDocument(source,[anchor]);
    expect(hits.map(hit=>hit.text)).toEqual(['[ABC]','[ABC]']);
  });
  it('handles backslashes safely in manually learned terms', () => {
    const source='Ordner C:\\Users und C:\\Users.';
    const start=source.indexOf('C:\\Users');
    const anchor:Finding={id:'manual-4',origin:'manual',kind:'OTHER',text:'C:\\Users',start,end:start+8};
    const hits=scanDocument(source,[anchor]);
    expect(hits.map(hit=>hit.text)).toEqual(['C:\\Users','C:\\Users']);
  });
});
