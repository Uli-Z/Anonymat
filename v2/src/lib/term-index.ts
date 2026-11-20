/**
 * Dependency-free multi-term matcher (Aho–Corasick).
 *
 * One pass over the folded text, regardless of the number of learned names.
 * Offset mapping uses UTF-16 indices to match CodeMirror/Svelte positions.
 * Never interpolate user-supplied terms into regular expressions.
 */
export interface TermOccurrence {
  start: number;
  end: number;
  text: string;
  term: string;
}
interface Output { term: string; foldedLength: number }
interface Node {
  next: Map<string, number>;
  fail: number;
  outputs: Output[];
}
const wordChar = /[\p{L}\p{M}\p{N}_]/u;

function fold(input: string): string {
  return input.toLocaleLowerCase('de');
}

function foldDocument(input: string): {folded: string; starts: number[]; ends: number[]} {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for(let i=0;i<input.length;) {
    const cp = String.fromCodePoint(input.codePointAt(i)!);
    const end=i+cp.length;
    const part=fold(cp);
    folded += part;
    for(let j=0;j<part.length;j++) {
      starts.push(i);
      ends.push(end);
    }
    i=end;
  }
  return {folded,starts,ends};
}

function hasWordCharBefore(text: string, offset: number): boolean {
  if(offset<=0)return false;
  const start=offset>=2 && /[\uDC00-\uDFFF]/.test(text[offset-1])
    && /[\uD800-\uDBFF]/.test(text[offset-2]) ? offset-2 : offset-1;
  return wordChar.test(text.slice(start,offset));
}
function hasWordCharAfter(text: string, offset: number): boolean {
  if(offset>=text.length)return false;
  const cp=String.fromCodePoint(text.codePointAt(offset)!);
  return wordChar.test(cp);
}

export function findTerms(text: string, terms: readonly string[]): TermOccurrence[] {
  const normalized=new Map<string,Output>();
  for(const raw of terms) {
    const term=raw.trim();
    if(!term || term.length>200)continue;
    const folded=fold(term);
    if(!normalized.has(folded))normalized.set(folded,{term,foldedLength:folded.length});
  }
  if(!text || !normalized.size)return [];
  const nodes:Node[]=[{next:new Map(),fail:0,outputs:[]}];
  for(const [pattern,output] of normalized) {
    let node=0;
    for(const unit of pattern) {
      // Handle UTF-16 positions consistently by indexing code units.
      for(let n=0;n<unit.length;n++){
        const char=unit[n];
        let next=nodes[node].next.get(char);
        if(next===undefined) {
          next=nodes.length;
          nodes[node].next.set(char,next);
          nodes.push({next:new Map(),fail:0,outputs:[]});
        }
        node=next;
      }
    }
    nodes[node].outputs.push(output);
  }
  const queue:number[]=[];
  for(const child of nodes[0].next.values())queue.push(child);
  for(let head=0;head<queue.length;head++){
    const parent=queue[head];
    for(const [char,child] of nodes[parent].next){
      let fail=nodes[parent].fail;
      while(fail!==0 && !nodes[fail].next.has(char))fail=nodes[fail].fail;
      nodes[child].fail=nodes[fail].next.get(char)??0;
      nodes[child].outputs.push(...nodes[nodes[child].fail].outputs);
      queue.push(child);
    }
  }

  const {folded,starts,ends}=foldDocument(text);
  const result:TermOccurrence[]=[];
  let node=0;
  for(let i=0;i<folded.length;i++){
    const char=folded[i];
    while(node!==0 && !nodes[node].next.has(char))node=nodes[node].fail;
    node=nodes[node].next.get(char)??0;
    for(const out of nodes[node].outputs){
      const from=i-out.foldedLength+1;
      if(from<0)continue;
      const start=starts[from],end=ends[i];
      // Whole words, including Unicode letters, not substrings of larger words.
      if(hasWordCharBefore(text,start)||hasWordCharAfter(text,end))continue;
      result.push({start,end,text:text.slice(start,end),term:out.term});
    }
  }
  return result.sort((a,b)=>a.start-b.start || b.end-a.end);
}
