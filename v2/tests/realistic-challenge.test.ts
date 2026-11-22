import { describe, expect, it } from 'vitest';
import { reviewDocument } from '../src/lib/session';
import { maskText, restoreText } from '../src/lib/replace';
import { restoreShiftedDates } from '../src/lib/dates';
import { restoreShiftedPartialDates } from '../src/lib/partial-dates';
import type { Finding, Kind } from '../src/lib/detect-types';
import corpus from './fixtures/realistic-challenge-scenarios.json';

type Expected = { text: string; kind: Kind; mode: 'active'|'review'; occurrence?: number };
type Fixture = { id:string; category:string; text:string; expected:Expected[]; forbidden:string[]; numericOrder:'auto'|'DMY'|'MDY' };
type Span = Expected & { start:number; end:number };
const fixtures = corpus.fixtures as Fixture[];

function locate(source:string,needle:string):{start:number;end:number}[]{
  const out:{start:number;end:number}[]=[];
  let offset=0;
  while(offset<source.length){
    const start=source.indexOf(needle,offset);
    if(start<0)break;
    out.push({start,end:start+needle.length});
    offset=start+needle.length;
  }
  return out;
}
function expectedSpans(f:Fixture):Span[]{
  const spans=f.expected.flatMap(e=>locate(f.text,e.text)
    .filter((_,i)=>e.occurrence===undefined||e.occurrence===i+1)
    .map(x=>({...e,...x})));
  return spans.filter(s=>!spans.some(other=>other!==s
    && other.start<=s.start && other.end>=s.end
    && (other.start<s.start || other.end>s.end)));
}
const exactly=(hit:Finding,span:Span)=>hit.start===span.start&&hit.end===span.end&&hit.kind===span.kind;
const covers=(hit:Finding,span:{start:number;end:number})=>hit.start<=span.start&&hit.end>=span.end;

describe('independent 26-case realistic challenge batch (fully synthetic)',()=>{
  it('contains non-empty annotations and unambiguous reference positions',()=>{
    expect(fixtures).toHaveLength(26);
    expect(new Set(fixtures.map(f=>f.id)).size).toBe(fixtures.length);
    for(const f of fixtures){
      expect(f.text.length, f.id).toBeGreaterThan(40);
      for(const e of f.expected)expect(locate(f.text,e.text)[(e.occurrence??1)-1],f.id+': '+e.text).toBeDefined();
      for(const n of f.forbidden)expect(f.text.includes(n),f.id+': '+n).toBe(true);
    }
  });

  it('reports recall, exact spans, over-masking, suggestions and reversibility without hiding limitations',()=>{
    const errors: Array<{id:string;missed:string[];notExact:string[];missingReview:string[];overMasks:string[];overReviews:string[];forbidden:string[];roundtrip:string[]}>=[];
    const counts={scenarios:fixtures.length,activeExpected:0,activeProtected:0,activeExact:0,
      reviewExpected:0,reviewOffered:0,missed:0,wrongSpanOrType:0,
      additionalActiveMasks:0,additionalReviews:0,forbiddenMasked:0,
      failedTokenRoundTrips:0,failedDateRoundTrips:0};
    for(const f of fixtures){
      const gold=expectedSpans(f);
      const result=reviewDocument(f.text,[],[],[],f.numericOrder);
      const active=result.active;
      const review=result.findings.filter(h=>h.confidence==='review');
      const report={id:f.id,missed:[] as string[],notExact:[] as string[],
        missingReview:[] as string[],overMasks:[] as string[],overReviews:[] as string[],
        forbidden:[] as string[],roundtrip:[] as string[]};
      for(const s of gold){
        if(s.mode==='review'){
          counts.reviewExpected++;
          if(review.some(h=>exactly(h,s))&&!active.some(h=>covers(h,s)))counts.reviewOffered++;
          else report.missingReview.push(s.kind+':'+s.text);
        }else{
          counts.activeExpected++;
          if(active.some(h=>covers(h,s)))counts.activeProtected++;
          else {counts.missed++;report.missed.push(s.kind+':'+s.text);}
          if(active.some(h=>exactly(h,s)))counts.activeExact++;
          else if(active.some(h=>covers(h,s))){counts.wrongSpanOrType++;report.notExact.push(s.kind+':'+s.text);}
        }
      }
      for(const h of active)if(!gold.some(s=>s.mode==='active'&&exactly(h,s))){
        counts.additionalActiveMasks++;report.overMasks.push(h.kind+':'+h.text);
      }
      for(const h of review)if(!gold.some(s=>s.mode==='review'&&exactly(h,s))){
        counts.additionalReviews++;report.overReviews.push(h.kind+':'+h.text);
      }
      for(const negative of f.forbidden)for(const region of locate(f.text,negative)){
        if(gold.some(s=>s.mode==='active'&&s.start<=region.start&&s.end>=region.end))continue;
        if(active.some(h=>covers(h,region))){counts.forbiddenMasked++;report.forbidden.push(negative);}
      }
      const masked=maskText(f.text,active);
      if(restoreText(masked.text,masked.mapping).text!==f.text){
        counts.failedTokenRoundTrips++;report.roundtrip.push('token');
      }
      const shifted=maskText(f.text,active,{},{
        dateShiftEnabled:true,offsetDays:30,numericOrder:f.numericOrder
      });
      const partial=restoreShiftedPartialDates(shifted.text,shifted.partialDates);
      const full=restoreShiftedDates(partial.text,shifted.dates.map(d=>d.shiftedIso),30,
        {numericOrder:f.numericOrder});
      if(restoreText(full.text,shifted.mapping).text!==f.text){
        counts.failedDateRoundTrips++;report.roundtrip.push('date');
      }
      if(Object.entries(report).some(([k,v])=>k!=='id'&&v.length))errors.push(report);
    }
    console.info('ANONYMAT_CHALLENGE_SUMMARY '+JSON.stringify(counts));
    console.info('ANONYMAT_CHALLENGE_FINDINGS '+JSON.stringify(errors));
    // No retrospective relabeling of genuine detection misses as acceptable.
    // This is a deliberately adversarial exploratory corpus: log its baseline
    // before promoting stable cases to blocking regression assertions.
    expect(counts.failedTokenRoundTrips,'Applied token replacements must be reversible').toBe(0);
  });
});
