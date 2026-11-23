import { describe,expect,it } from 'vitest';
import { makeRule, normalizedKey } from '../src/lib/learned-rules';
import { scanDocument } from '../src/lib/detect';
import { reviewDocument } from '../src/lib/session';
import { maskText } from '../src/lib/replace';

describe('cross-document learning',()=>{
  it('normalizes keys without storing a full source document',()=>{
    const rule=makeRule('  Änne Meier  ','PERSON');
    expect(rule?.key).toBe(normalizedKey('änne meier'));
    expect(rule?.term).toBe('Änne Meier');
    expect(rule?.autoApply).toBe(false);
    expect(makeRule('  ','OTHER')).toBeNull();
    expect(makeRule('X','PERSON')).toBeNull();
  });
  it('reuses a prior manual name as a review proposal, never an unapproved replacement',()=>{
    const learned=makeRule('Zorbel','PERSON')!;
    const input='Zorbel wurde aufgenommen. ZORBEL wurde entlassen.';
    const reviewed=reviewDocument(input,[],[],[],'auto',true,[learned]);
    expect(reviewed.findings.filter(f=>f.origin==='learned')).toHaveLength(2);
    expect(reviewed.groups.find(g=>g.text==='Zorbel')).toMatchObject({count:2,activeCount:0,learned:true,review:true});
    expect(maskText(input,reviewed.active).text).toBe(input);
  });
  it('automatically masks an explicitly trusted stored rule in another text',()=>{
    const rule={...makeRule('Zorbel','LAST_NAME')!,autoApply:true};
    const input='Zorbel bestätigt, ZORBEL antwortet.';
    const reviewed=reviewDocument(input,[],[],[],'auto',true,[rule]);
    expect(reviewed.active.filter(h=>h.origin==='learned')).toHaveLength(2);
    expect(maskText(input,reviewed.active).text).toBe('[LAST_NAME_001] bestätigt, [LAST_NAME_002] antwortet.');
  });
  it('respects manually marked corrections over stored classification',()=>{
    const input='Zorbel sprach.';
    const remembered=[{...makeRule('Zorbel','CITY')!,autoApply:true}];
    const manual=[{id:'manual-1',kind:'PERSON' as const,origin:'manual' as const,
      text:'Zorbel',start:0,end:6}];
    expect(scanDocument(input,manual,'auto',true,remembered)[0].kind).toBe('PERSON');
  });
  it('does not match substrings of ordinary words',()=>{
    const remembered=[makeRule('Zorbel','PERSON')!];
    const matches=scanDocument('Zorbelberg und Zorbel.',[],'auto',true,remembered)
      .filter(hit=>hit.origin==='learned');
    expect(matches.map(hit=>hit.text)).toEqual(['Zorbel']);
  });
  it('does not turn an already certain automatic detection into an unconfirmed one',()=>{
    const remembered=[makeRule('Müller','PERSON')!];
    const input='Frau Müller antwortet.';
    const reviewed=reviewDocument(input,[],[],[],'auto',true,remembered);
    expect(reviewed.active.some(hit=>hit.text==='Müller')).toBe(true);
  });
});
