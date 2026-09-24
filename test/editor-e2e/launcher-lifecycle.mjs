import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,access,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const root=process.cwd();
const data=await mkdtemp(join(tmpdir(),'stellar-integrated-launcher-'));
async function port(){const s=createServer();await new Promise((r,j)=>s.once('error',j).listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;}
async function released(n){const s=createServer();try{await new Promise((r,j)=>s.once('error',j).listen(n,'127.0.0.1',r));return true;}catch{return false;}finally{if(s.listening)await new Promise(r=>s.close(r));}}
async function until(check,label,ms=80000){const end=Date.now()+ms;while(Date.now()<end){if(await check())return;await delay(150);}throw new Error(label+' timed out');}
let active;let baseline;
try{
 for(const termination of ['SIGTERM','SIGKILL','SIGTERM']){
  const appPort=await port();let runnerPort=await port();while(appPort===runnerPort)runnerPort=await port();
  let output='';
  active=spawn(process.execPath,[join(root,'apps/runner/src/launcher.mjs')],{cwd:root,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:tmpdir(),NEXT_TELEMETRY_DISABLED:'1',STELLAR_PLATFORM_MODE:'0',STELLAR_DATA_DIR:data,STELLAR_APP_PORT:String(appPort),STELLAR_RUNNER_PORT:String(runnerPort)},stdio:['ignore','pipe','pipe']});
  active.stdout.on('data',x=>output+=x);active.stderr.on('data',x=>output+=x);
  await until(()=>{if(active.exitCode!==null)throw new Error('Launcher exited before readiness');return output.includes('Stellar is ready.')&&output.includes('/connect#');},'Launcher readiness');
  assert.equal((await fetch(`http://127.0.0.1:${appPort}/connect`)).status,200);
  const registry=await readFile(join(data,'registry.json'),'utf8');
  if(baseline)assert.equal(registry,baseline,'Saved registry survives launcher restart');else baseline=registry;
  const exited=new Promise(r=>active.once('exit',r));active.kill(termination);await exited;active=undefined;
  await until(async()=>await released(appPort)&&await released(runnerPort),'Owned listeners retire',15000);
  await until(async()=>{try{await access(join(data,'.runner-lease'));return false;}catch{return true;}},'Runner lease releases',15000);
  console.log(JSON.stringify({termination,ready:true,listenersReleased:true,leaseReleased:true,registryPreserved:true}));
 }
}finally{if(active){active.kill('SIGTERM');await delay(7000);}await rm(data,{recursive:true,force:true});}
