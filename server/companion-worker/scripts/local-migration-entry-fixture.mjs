import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createCompanionServer } from '@zzzode/companion-server';
import { migrateLegacy } from '../dist/admin.js';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const directory = await mkdtemp(join(tmpdir(), 'leanon-native-cutover-'));
const legacyFile = join(directory,'legacy.json');
if(process.env.LEANON_MIGRATION_LEGACY_SEED) await (await import('node:fs/promises')).copyFile(process.env.LEANON_MIGRATION_LEGACY_SEED,legacyFile);
const old = await createCompanionServer({file:legacyFile,port:64041});
const mf = new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',port:64044,scriptPath:resolve('dist/worker.js'),modules:true,compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['PHOTOS'],telemetry:{enabled:false}}),resourcePersistencePath:join(directory,'target')});
const db = await mf.getD1Database('DB');
await db.batch((await readFile('migrations/0001-private-relay.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
await mf.ready;
let prepared = false, held = false;
const proxy = createServer(async (request,response)=>{
 try {
  if(request.url==='/v2/migrations/complete' && held) {
   const deadline=Date.now()+25000;
   while(held && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
   if(held) {response.writeHead(503,{'content-type':'application/json'});response.end(JSON.stringify({error:{code:'unavailable',message:'PUBLIC fixture interruption'}}));return;}
  }
  const chunks=[];for await(const chunk of request)chunks.push(chunk);
  const body=Buffer.concat(chunks);
  const result=await fetch('http://127.0.0.1:64044'+request.url,{method:request.method,headers:request.headers,...(body.length?{body}:{}),redirect:'manual'});
  const headers=new Headers(result.headers);for(const name of ['content-encoding','content-length','transfer-encoding'])headers.delete(name);
  response.writeHead(result.status,Object.fromEntries(headers));response.end(Buffer.from(await result.arrayBuffer()));
 }catch{response.writeHead(503);response.end('{}');}
});
await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(64043,'127.0.0.1',resolve);});
const control = createServer(async (request,response)=>{
  try {
    if(request.method==='POST' && request.url==='/v1/hold'){held=true;response.end('{}');return;}
    if(request.method==='POST' && request.url==='/v1/release'){held=false;response.end('{}');return;}
    if(request.method!=='POST'||request.url!=='/v1/prepare') {response.writeHead(404);response.end('{}');return;}
    const state=JSON.parse(await readFile(legacyFile,'utf8'));
    const aggregateCount=Object.values(state.groups).flatMap(g=>Object.values(g.records)).filter(r=>r.category==='vault').length;
    if(aggregateCount<2) throw new Error('Both synthetic legacy vaults must exist');
    if(!prepared) {
      try {await migrateLegacy(db,state);throw new Error('Unsafe opaque migration unexpectedly permitted');} catch(error) {if(!String(error).includes('republication required'))throw error;}
      if(await db.prepare('SELECT count(*) AS n FROM accounts').first('n'))throw new Error('Preflight rejection wrote target');
      await migrateLegacy(db,state,{operationId:'PUBLIC-cloudflare-cutover-01'});prepared=true;
    }
    response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({id:'PUBLIC-cloudflare-cutover-01',status:'prepared',legacyVaults:aggregateCount}));
  }catch {response.writeHead(503,{'content-type':'application/json'});response.end(JSON.stringify({error:{code:'synthetic_migration_fixture_failure'}}));}
});
await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(64042,'127.0.0.1',resolve);});
process.stdout.write('local_migration_fixture_ready old=64041 control=64042 target=64043\n');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await new Promise(resolve=>control.close(resolve));held=false;await new Promise(resolve=>proxy.close(resolve));await old.close();await mf.dispose();await rm(directory,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
