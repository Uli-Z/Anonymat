import {describe,expect,it} from 'vitest';
import {applyFindingsBatch,findingsWithinSelection} from '../src/lib/selection-batch';
import {replacementKey} from '../src/lib/replacement-strategies';
import type {Finding} from '../src/lib/detect-types';

const anna:Finding={id:'a',kind:'PERSON',text:'Anna Müller',start:6,end:17,origin:'automatic',confidence:'certain'};
const mail:Finding={id:'b',kind:'EMAIL',text:'a@example.org',start:25,end:38,origin:'automatic',confidence:'certain'};
const review:Finding={id:'c',kind:'FIRST_NAME',text:'Ulrich',start:41,end:47,origin:'automatic',confidence:'review'};
const empty=()=>({manual:[] as Finding[],ignoredPlaces:[] as Finding[],ignoredTerms:[] as string[],
  replacementRules:{},manualCounter:0,exclusionCounter:0});

describe('bulk editing a selected text region',()=>{
  it('lists only fully enclosed findings in source order',()=>{
    expect(findingsWithinSelection([mail,review,anna],0,46).map(h=>h.id)).toEqual(['a','b']);
    expect(findingsWithinSelection([anna,mail],7,40).map(h=>h.id)).toEqual(['b']);
    expect(findingsWithinSelection([anna,mail],25,25)).toEqual([]);
  });
  it('excludes only chosen occurrences and does not duplicate exclusions',()=>{
    const first=applyFindingsBatch([anna,mail],'exclude','default',empty());
    expect(first.ignoredPlaces.map(p=>p.id)).toEqual(['ignored-1','ignored-2']);
    const again=applyFindingsBatch([anna],'exclude','default',first);
    expect(again.ignoredPlaces).toHaveLength(2);
    expect(again.exclusionCounter).toBe(2);
  });
  it('accepts review findings but does not mask the selected paragraph as one hit',()=>{
    const state={...empty(),ignoredTerms:['Ulrich','unrelated'],ignoredPlaces:[{...review,id:'ignored-4'},{...mail,id:'ignored-5'}]};
    const next=applyFindingsBatch([anna,review],'mask','default',state);
    expect(next.manual).toMatchObject([{text:'Ulrich',start:41,end:47}]);
    expect(next.learned).toEqual([{text:'Ulrich',kind:'FIRST_NAME'}]);
    expect(next.ignoredPlaces.map(item=>item.id)).toEqual(['ignored-5']);
    expect(next.ignoredTerms).toEqual(['unrelated']);
  });
  it('uses pseudonyms only for supported types and preserves unrelated rules',()=>{
    const next=applyFindingsBatch([anna,mail],'mask','synthetic',{...empty(),replacementRules:{
      untouched:{mode:'token',kind:'DATE'}
    }});
    expect(next.replacementRules[replacementKey('PERSON','Anna Müller')].mode).toBe('synthetic');
    expect(next.replacementRules[replacementKey('EMAIL','a@example.org')].mode).toBe('token');
    expect(next.replacementRules.untouched.mode).toBe('token');
  });
  it('leaves unselected matches untouched',()=>{
    const state={...empty(),ignoredPlaces:[{...mail,id:'ignored-mail'}]};
    const next=applyFindingsBatch([anna],'exclude','token',state);
    expect(next.ignoredPlaces.map(hit=>hit.id)).toEqual(['ignored-mail','ignored-1']);
    expect(next.replacementRules).toEqual({});
  });
});
