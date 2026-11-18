import {requestStatsProjection} from './request-stats-projection.js';
import {createKeepalive,setActiveKeepalive,activeKeepalive} from './cache-keepalive.js';
import {registerHttpRoutes} from './http-routes.js';
export const name='cache-manager';
export const inject=['agents','sessionProjections','webServer'];
export function apply(ctx){
 ctx.sessionProjections.register(requestStatsProjection);
 ctx.effect(()=>registerHttpRoutes(ctx),'cache-manager: endpoints');
 ctx.effect(()=>{
  const keepalive=createKeepalive(ctx);setActiveKeepalive(keepalive);const offs=[];
  try{
   offs.push(ctx.on('agent/status',({agent,status})=>keepalive.onStatus(agent,status),{global:true}));
   offs.push(ctx.on('agent/disposed',({agent})=>keepalive.onDisposed(agent),{global:true}));
   ctx.inject(['llm'],child=>{keepalive.attach(child.get('llm'));child.effect(()=>()=>keepalive.attach(undefined));});
  }catch(error){for(const off of offs.reverse())off();keepalive.dispose();setActiveKeepalive(undefined);throw error;}
  return ()=>{for(const off of offs.reverse())off();keepalive.dispose();if(activeKeepalive()===keepalive)setActiveKeepalive(undefined);};
 },'cache-manager: scheduler');
}
