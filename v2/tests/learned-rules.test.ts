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
    expect(rule).not.toHaveProperty('autoApply');
    expect(makeRule('  ','OTHER')).toBeNull();
    expect(makeRule('X','PERSON')).toBeNull();
  });
  it('immediately masks a stored manual name in future texts',()=>{
    const learned=makeRule('Zorbel','PERSON')!;
    const input='Zorbel wurde aufgenommen. ZORBEL wurde entlassen.';
    const reviewed=reviewDocument(input,[],[],[],'auto',true,[learned]);
    expect(reviewed.findings.filter(f=>f.origin==='learned')).toHaveLength(2);
    expect(reviewed.groups.find(g=>g.text==='Zorbel')).toMatchObject({count:2,activeCount:2,learned:true,review:false});
    expect(reviewed.pending).toHaveLength(0);
    expect(maskText(input,reviewed.active).text).not.toContain('Zorbel');
  });
  it('automatically masks every stored rule in another text',()=>{
    const rule=makeRule('Zorbel','LAST_NAME')!;
    const input='Zorbel bestätigt, ZORBEL antwortet.';
    const reviewed=reviewDocument(input,[],[],[],'auto',true,[rule]);
    expect(reviewed.active.filter(h=>h.origin==='learned')).toHaveLength(2);
    expect(maskText(input,reviewed.active).text).toBe('[LAST_NAME_001] bestätigt, [LAST_NAME_002] antwortet.');
  });
  it('respects manually marked corrections over stored classification',()=>{
    const input='Zorbel sprach.';
    const remembered=[makeRule('Zorbel','CITY')!];
    const manual=[{id:'manual-1',kind:'PERSON' as const,origin:'manual' as const,
      text:'Zorbel',start:0,end:6}];
    expect(scanDocument(input,manual,'auto',true,remembered)[0].kind).toBe('PERSON');
  });
  it('reuses a manually corrected category where the automatic detector already masks the same span',()=>{
    const remembered=[makeRule('Müller','LAST_NAME')!];
    const input='Frau Müller antwortet.';
    const reviewed=reviewDocument(input,[],[],[],'auto',true,remembered);
    expect(reviewed.active.find(hit=>hit.text==='Müller')?.kind).toBe('LAST_NAME');
    expect(reviewed.active.find(hit=>hit.text==='Müller')?.origin).toBe('learned');
  });
  it('directly masks the surname and German genitive after learning a full person name',()=>{
    const remembered=[makeRule('Ulrich Meier','PERSON')!];
    const input='Meier und Meiers, nicht Meierberg.';
    const found=scanDocument(input,[],'auto',true,remembered).filter(hit=>hit.origin==='learned');
    expect(found.map(hit=>hit.text)).toEqual(['Meier','Meiers']);
    expect(found.every(hit=>hit.confidence!=='review')).toBe(true);
  });
  it('traces a learned surname and genitive back to the original full-name rule',()=>{
    const stored=makeRule('Ulrich Xytronix','PERSON')!;
    const hits=scanDocument('Xytronix und Xytronixs.',[],'auto',true,[stored])
      .filter(hit=>hit.origin==='learned');
    expect(hits.map(hit=>hit.text)).toEqual(['Xytronix','Xytronixs']);
    expect(hits.map(hit=>hit.learnedRuleKey)).toEqual([stored.key,stored.key]);
    const withoutMemory=scanDocument('Xytronix und Xytronixs.',[],'auto',true,[])
      .filter(hit=>hit.origin==='learned');
    expect(withoutMemory).toHaveLength(0);
  });
  it('keeps the learned-rule provenance when occurrences are ignored in the document',()=>{
    const stored=makeRule('Zorbel','PERSON')!;
    const reviewed=reviewDocument('Zorbel antwortet.',[],[],['Zorbel'],'auto',true,[stored]);
    expect(reviewed.active).toHaveLength(0);
    expect(reviewed.findings.find(hit=>hit.origin==='learned')?.learnedRuleKey).toBe(stored.key);
    expect(reviewed.groups[0]?.learned).toBe(true);
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
