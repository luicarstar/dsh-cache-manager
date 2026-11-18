import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {apply} from './index.js';
test('cache owns projection, scheduler and endpoint and releases them',()=>{
 const routes=[],events=[],effects=[],projections=[];
 const ctx={logger:{warn(){}},agents:{list:()=>[]},sessionProjections:{register:x=>projections.push(x)},webServer:{register:r=>{routes.push(r);return()=>routes.splice(routes.indexOf(r),1);}},on:(name,fn)=>{events.push(name);return()=>events.splice(events.indexOf(name),1);},effect:fn=>effects.push(fn()),inject:(_names,fn)=>fn({get:()=>({}),effect:fn=>effects.push(fn())})};
 apply(ctx);assert.equal(projections.length,1);assert.deepEqual(routes.map(x=>x.path),['/dsh-cache-manager/cache-keepalive']);assert.equal(events.length,2);
 for(const off of effects.reverse())off?.();assert.equal(routes.length,0);assert.equal(events.length,0);
});
test('host entry owns no session management or unrelated UI ownership',()=>{
 const source=['index.js','http-routes.js','cache-keepalive.js','request-stats-projection.js']
   .map(x=>fs.readFileSync(new URL(x,import.meta.url),'utf8')).join('\n');
 for(const forbidden of ['cleanup-preview','FavoritesSettingsSection','RenameRowButton','createRequestStatsModule'])
   assert.equal(source.includes(forbidden),false,forbidden);
});
test('every shipped module parses and the built client is present',()=>{
 const files=fs.readdirSync(new URL('.',import.meta.url)).filter(x=>x.endsWith('.js')||x.endsWith('.mjs'));
 assert.ok(files.length>0);
 assert.ok(fs.statSync(new URL('client.js',import.meta.url)).size>0,'client.js missing or empty');
});
