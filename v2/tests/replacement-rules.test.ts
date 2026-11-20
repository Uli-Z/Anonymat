import { describe,expect,it } from 'vitest';
import { detectPII } from '../src/lib/detect';
import { maskText, restoreText, splitForPreview } from '../src/lib/replace';
import { replacementKey, validateCustomToken } from '../src/lib/replacement-strategies';

describe('replacement rules',()=>{
  it('supports changing a token without losing inverse mapping',()=>{
    const text='Frau Müller und Müller.';
    const rules={
      [replacementKey('PERSON','Müller')]:{mode:'custom-token' as const,kind:'PERSON' as const,token:'[ALIAS_A]'}
    };
    const masked=maskText(text,detectPII(text),rules);
    expect(masked.text).toBe('Frau [ALIAS_A] und [ALIAS_A].');
    expect(restoreText(masked.text,masked.mapping).text).toBe(text);
    expect(splitForPreview(masked.text).filter(x=>x.token)).toHaveLength(2);
  });
  it('rejects unsafe non-placeholder custom values',()=>{
    expect(validateCustomToken('Frau Beispiel')).not.toBeNull();
    expect(validateCustomToken('[PATIENT_A]')).toBeNull();
    expect(validateCustomToken('[FOO_007]')).toBeNull();
  });
  it('prevents collisions with tokens already present in source',()=>{
    const source='Frau Müller sagte: [PATIENT_A].';
    const rules={
      [replacementKey('PERSON','Müller')]:{mode:'custom-token' as const,kind:'PERSON' as const,token:'[PATIENT_A]'}
    };
    const result=maskText(source,detectPII(source),rules);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.text).toContain('[PERSON_001]');
  });
  it('avoids a collision between two distinct custom originals',()=>{
    const source='Frau Müller und Frau Schulz.';
    const rules={
      [replacementKey('PERSON','Müller')]:{mode:'custom-token' as const,kind:'PERSON' as const,token:'[PATIENT_A]'},
      [replacementKey('PERSON','Schulz')]:{mode:'custom-token' as const,kind:'PERSON' as const,token:'[PATIENT_A]'}
    };
    const result=maskText(source,detectPII(source),rules);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(new Set(result.mapping.map(m=>m.token)).size).toBe(2);
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });
  it('keeps exact original capitalization even when a group has case variants',()=>{
    const source='Frau Müller sagte: MÜLLER.';
    const result=maskText(source,detectPII(source),{
      [replacementKey('PERSON','Müller')]:{mode:'custom-token',kind:'PERSON',token:'[NAME_X]'}
    });
    expect(result.mapping).toHaveLength(2);
    expect(new Set(result.mapping.map(m=>m.token)).size).toBe(2);
    expect(restoreText(result.text,result.mapping).text).toBe(source);
  });
});
