import {json,readBody,parseRequest} from './http-utils.js';
import {activeKeepalive} from './cache-keepalive.js';
export function registerHttpRoutes(ctx){
 const routes=[
    ["cache-keepalive", async (req, res) => {
      const ka = activeKeepalive();
      if (!ka) return json(res, 200, {ok:false, error:'续缓存服务未启动'});
      try {
        if (req.method === 'GET') {
          const url = new URL(req.url, 'http://local');
          const sessionId = url.searchParams.get('sessionId');
          const catalog = url.searchParams.get('catalog') === '1' ? await ka.catalog() : undefined;
          return json(res, 200, {ok:true, config: ka.config(), session: sessionId ? ka.status(sessionId) : null, ...(catalog ? {catalog} : {})});
        }
        if (req.method !== 'POST') return json(res, 405, {ok:false, error:'method not allowed'});
        const body = parseRequest(await readBody(req));
        if (!body || typeof body.op !== 'string') return json(res, 400, {ok:false, error:'bad request'});
        if (body.op === 'save') return json(res, 200, {ok:true, config: ka.saveConfig(body.config)});
        if (typeof body.sessionId !== 'string') return json(res, 400, {ok:false, error:'bad request'});
        if (body.op === 'pause') return json(res, 200, {ok:true, session: ka.pause(body.sessionId)});
        if (body.op === 'resume') return json(res, 200, {ok:true, session: ka.resume(body.sessionId)});
        return json(res, 400, {ok:false, error:'unknown op'});
      } catch (error) { return json(res, 200, {ok:false, error:String(error?.message ?? error)}); }
    }]
 ];const offs=[];
 try {for(const [path,handler] of routes)offs.push(ctx.webServer.register({kind:'exact',path:'/dsh-cache-manager/'+path,handler}));}
 catch(error){for(const off of offs.reverse())off();throw error;}
 return ()=>{for(const off of offs.reverse())off();};
}
