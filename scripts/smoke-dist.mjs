// Production bundle smoke test without contacting Firebase or an SMS provider.
import {spawn} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
const config=JSON.parse(readFileSync('firebase-applet-config.json','utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const private_key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const port=43189;
const child=spawn(process.execPath,['dist/server.cjs'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),SMS_SCHEDULER_ENABLED:'false',SMS_SENDING_ENABLED:'false',FIRESTORE_EMULATOR_HOST:'127.0.0.1:1',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:1',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({project_id:config.projectId,client_email:'fake@example.com',private_key})},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
const request=path=>new Promise((resolve,reject)=>{
  const req=http.get({host:'127.0.0.1',port,path,headers:{'x-tenant-id':'smoke_test'},timeout:1000},res=>{
    let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));
  });
  req.on('error',reject);req.on('timeout',()=>req.destroy(new Error(`Local request timeout: ${path}`)));
});
try{
  let health;
  for(let i=0;i<30;i++){
    if(child.exitCode!==null)throw new Error(output);
    try{const res=await request('/api/health');if(res.status===200){health=JSON.parse(res.body);break;}}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(health?.version,pkg.version,output);
  const html=await request('/');assert.equal(html.status,200);assert.match(html.body,/id="root"/);
  const missing=await request('/api/unknown');assert.equal(missing.status,404);assert.equal(JSON.parse(missing.body).error,'API route not found');
  assert.equal((await request('/api/super-admin/sms-scheduler')).status,403);
  console.log(`Production V${pkg.version} smoke passed: startup, health, SPA, API 404, anonymous scheduler access denied. No real SMS or Firebase.`);
}finally{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
}
