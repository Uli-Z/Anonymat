import type { Kind } from './detect-types';

/** Only explicit terms and their classification persist; never source documents or token mappings. */
export interface LearnedRule {
  key: string;
  term: string;
  kind: Kind;
  autoApply: boolean;
  updatedAt: number;
}

export function normalizedKey(term:string):string {
  return term.trim().normalize('NFC').toLocaleLowerCase('de');
}

export function makeRule(term:string,kind:Kind,autoApply=false):LearnedRule|null {
  const cleaned=term.trim().normalize('NFC');
  if(cleaned.length<2 || cleaned.length>200 || !/[\p{L}\p{N}]/u.test(cleaned))return null;
  return {key:normalizedKey(cleaned),term:cleaned,kind,autoApply,updatedAt:Date.now()};
}

const DB_NAME='anonymat-learned-rules';
const STORE='rules';
let connection:Promise<IDBDatabase>|null=null;
function database():Promise<IDBDatabase>{
  if(!connection){
    connection=new Promise<IDBDatabase>((resolve,reject)=>{
      if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB nicht verfügbar'));return;}
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(STORE)){
          request.result.createObjectStore(STORE,{keyPath:'key'});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error ?? new Error('Speicher kann nicht geöffnet werden'));
      request.onblocked=()=>reject(new Error('Speicherzugriff blockiert'));
    }).catch(error=>{connection=null;throw error;});
  }
  return connection!;
}
async function transact<T>(
  mode:IDBTransactionMode,
  execute:(store:IDBObjectStore,resolve:(value:T)=>void,reject:(reason?:unknown)=>void)=>void
):Promise<T>{
  const db=await database();
  return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    let value:T;
    let received=false;
    tx.oncomplete=()=>received?resolve(value):reject(new Error('Unvollständige Speicheroperation'));
    tx.onerror=()=>reject(tx.error ?? new Error('Speicheroperation fehlgeschlagen'));
    tx.onabort=()=>reject(tx.error ?? new Error('Speicheroperation abgebrochen'));
    execute(tx.objectStore(STORE),next=>{value=next;received=true;},reject);
  });
}
export async function loadLearnedRules():Promise<LearnedRule[]>{
  return transact('readonly',(store,resolve,reject)=>{
    const request=store.getAll();
    request.onsuccess=()=>{
      const rules=(request.result as LearnedRule[]).filter(rule=>
        rule && rule.key===normalizedKey(rule.term) &&
        typeof rule.autoApply==='boolean' && typeof rule.kind==='string'
      );
      resolve(rules);
    };
    request.onerror=()=>reject(request.error);
  });
}
export async function saveLearnedRules(rules:readonly LearnedRule[]):Promise<void>{
  if(!rules.length)return;
  await transact<void>('readwrite',(store,resolve)=>{
    for(const rule of rules)store.put(rule);
    resolve();
  });
}
export async function deleteLearnedRule(key:string):Promise<void>{
  await transact<void>('readwrite',(store,resolve)=>{store.delete(key);resolve();});
}
export async function clearLearnedRules():Promise<void>{
  await transact<void>('readwrite',(store,resolve)=>{store.clear();resolve();});
}
