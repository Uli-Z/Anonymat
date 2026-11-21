import { describe, expect, it } from 'vitest';
import { detectPII } from '../src/lib/detect';
import { maskText, restoreText } from '../src/lib/replace';
import { replacementKey } from '../src/lib/replacement-strategies';
import fixtures from './fixtures/translation/roundtrip.json';

describe('deterministic offline translation roundtrips (synthetic AI output)',()=>{
  for(const fixture of fixtures){
    it(fixture.id+' ('+fixture.lang+')',()=>{
      const source=fixture.source;
      const masked=maskText(source,detectPII(source));
      expect(masked.mapping.length).toBeGreaterThan(0);
      expect(masked.warnings).toEqual([]);
      const result=restoreText(fixture.translated,masked.mapping);
      expect(result).toEqual({text:fixture.expected,missing:[],unknown:[]});
    });
  }

  it('restores custom aliases in French without changing surrounding translated text',()=>{
    const source='Frau Müller ist erreichbar.';
    const custom={
      [replacementKey('PERSON','Müller')]:{mode:'custom-token' as const,kind:'PERSON' as const,token:'[PATIENT_A]'}
    };
    const masked=maskText(source,detectPII(source),custom);
    expect(masked.text).toBe('Frau [PATIENT_A] ist erreichbar.');
    const restored=restoreText('Madame [PATIENT_A] est disponible.',masked.mapping);
    expect(restored).toEqual({text:'Madame Müller est disponible.',missing:[],unknown:[]});
  });

  it('warns about a translated/changed placeholder rather than guessing',()=>{
    const mapping=maskText('Frau Müller ist hier.',detectPII('Frau Müller ist hier.')).mapping;
    const restored=restoreText('Ms. [PERSON_002] is here.',mapping);
    expect(restored.missing).toEqual(['[PERSON_001]']);
    expect(restored.unknown).toEqual(['[PERSON_002]']);
    expect(restored.text).toContain('[PERSON_002]');
  });

  it('flags deleted placeholders',()=>{
    const mapping=maskText('Frau Müller ist hier.',detectPII('Frau Müller ist hier.')).mapping;
    const restored=restoreText('The person is here.',mapping);
    expect(restored.missing).toEqual(['[PERSON_001]']);
  });

  it('does not mistake translated punctuation or moved placeholder order for token corruption',()=>{
    const source='Frau Müller und Frau Schulz.';
    const masked=maskText(source,detectPII(source));
    const restored=restoreText('[PERSON_002] ; puis [PERSON_001] !',masked.mapping);
    expect(restored.text).toBe('Schulz ; puis Müller !');
    expect(restored.unknown).toEqual([]);
    expect(restored.missing).toEqual([]);
  });
});
