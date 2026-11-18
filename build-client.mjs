import {readFileSync,writeFileSync} from 'node:fs';
import {Script} from 'node:vm';
const base=new URL('./',import.meta.url);
const feature=readFileSync(new URL('client/request-stats.js',base),'utf8').replace(/^export /gm,'');
const text=`window.__ModuleLoader__.load({id:'dsh-cache-manager',factory(require){
const React=require('react'),h=React.createElement,{createPortal}=require('react-dom');
${feature}
return {inject:['slots','sessions','remote'],apply(ctx){createRequestStatsModule({React,h,createPortal}).apply(ctx);}};
}});
`;
new Script(text);writeFileSync(new URL('client.js',base),text);
console.log('Built standalone cache client');
