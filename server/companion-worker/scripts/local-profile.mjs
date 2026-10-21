import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const state = await mkdtemp(join(tmpdir(), 'leanon-workerd-profile-'));
const mf = new Miniflare({ ...convertV4MiniflareOptions({ scriptPath: resolve('dist/worker.js'), modules: true, compatibilityDate: '2026-10-07', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['PHOTOS'], telemetry: { enabled: false } }), resourcePersistencePath: state });
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  await mf.ready;
  const db = await mf.getD1Database('DB');
  await db.batch((await readFile('migrations/0001-private-relay.sql', 'utf8')).split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  for (const slot of ['owner','partner']) await db.prepare("INSERT INTO admission_slots VALUES (?, ?, ?, ?, 'open', NULL)").bind(slot, hash(slot.repeat(9).slice(0,43).padEnd(43,'x')), slot, Date.now()+600000).run();
  const row = execFileSync('/bin/ps', ['-axo','pid,ppid,command'], { encoding:'utf8' }).split('\n').find(s => new RegExp('^\\s*\\d+\\s+'+process.pid+'\\s+.*workerd serve').test(s));
  if (!row) throw new Error('Actual child workerd process not found');
  const pid = Number(row.trim().split(/\s+/)[0]);
  const sample = () => {
    const values = execFileSync('/bin/ps', ['-p',String(pid),'-o','time=,rss='], {encoding:'utf8'}).trim().split(/\s+/);
    const cpu = values[0].split(':').map(Number).reduce((a,b)=>a*60+b,0)*1000;
    return {cpuMs:cpu,rssKiB:Number(values[1])};
  };
  const password = 'PUBLIC workerd performance fixture password 2026', proof = Buffer.alloc(32,17).toString('base64');
  async function request(slot, register) {
    const started = performance.now();
    const response = await mf.dispatchFetch('http://localhost/v1/'+(register?'accounts':'sessions'), {method:'POST',body:JSON.stringify({login:slot,password,deviceId:slot+'-device',deviceProof:proof,...(register?{admissionToken:slot.repeat(9).slice(0,43).padEnd(43,'x')}:{})})});
    if(response.status!==200) throw new Error('Synthetic authentication status '+response.status);
    await response.arrayBuffer(); return performance.now()-started;
  }
  for(const slot of ['owner','partner']) await request(slot,true);
  await request('owner',false);
  let peak = sample().rssKiB; const before = sample(), latencies = [];
  const timer = setInterval(()=>{peak=Math.max(peak,sample().rssKiB);},20);
  try {for(let n=0;n<20;n++) latencies.push(await request(n%2?'partner':'owner',false));} finally {clearInterval(timer);}
  const after = sample();latencies.sort((a,b)=>a-b);
  const result = {capturedUtc:new Date().toISOString(),runtime:'actual local workerd child process',scrypt:{N:16384,r:8,p:5,maxmemMiB:32},requests:20,cpuDeltaMs:after.cpuMs-before.cpuMs,aggregateCpuPerRequestMs:(after.cpuMs-before.cpuMs)/20,sampledProcessRssPeakMiB:peak/1024,wallMedianMs:latencies[10],wallP95Ms:latencies[18],scope:'CPU includes the Worker and local D1/R2 subworkers. Sampled process RSS is not isolate heap or a guaranteed peak. Warm sequential successful logins. No inference of remote Free feasibility.'};
  await writeFile(resolve('../../docs/cloudflare-local-2026-10-07/local-performance.json'),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result)+'\n');
} finally {await mf.dispose();await rm(state,{recursive:true,force:true});}
