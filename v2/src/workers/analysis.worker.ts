import { analyze } from '../lib/analysis-engine';
import { bundledCityCount, commonCityCollisionCount } from '../lib/geography';
import { bundledGivenNameCount, bundledFamilyNameCount } from '../lib/person-names';
import { bundledStreetCount } from '../lib/street-lexicon';
import type { AnalysisMessage, AnalysisRequest } from '../lib/analysis-protocol';

function send(message:AnalysisMessage):void{self.postMessage(message);}
send({type:'ready',counts:{
  cities:bundledCityCount,cityHomonyms:commonCityCollisionCount,
  first:bundledGivenNameCount,last:bundledFamilyNameCount,streets:bundledStreetCount
}});
self.addEventListener('message',(event:MessageEvent<AnalysisRequest>)=>{
  const request=event.data;
  if(!request || request.type!=='analyze')return;
  try{
    const result=analyze(request,(stage,completed)=>send({type:'stage',id:request.id,stage,completed}));
    send({type:'result',id:request.id,...result});
  }catch(error){
    send({type:'error',id:request.id,message:error instanceof Error?error.message:'Unbekannter Fehler'});
  }
});
