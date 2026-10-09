import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {scryptSync,createHmac} from 'node:crypto';import {fixture} from './fixtures.mjs';import auth from '../api/auth.js';import operations from '../api/operations.js';
test('HTTP login, read, payment save, refresh, idempotent retry, conflict and logout',async()=>{
 let state=fixture();process.env.SESSION_SECRET='integration-session';process.env.ADMIN_PASSWORD_HASH='qa:'+scryptSync('qa-password','qa',64).toString('hex');process.env.GOOGLE_SHEETS_BRIDGE_SECRET='qa-bridge';process.env.GOOGLE_SHEETS_BRIDGE_URL='https://script.google.com/macros/s/QA_ONLY/exec';
 const realFetch=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(url!==process.env.GOOGLE_SHEETS_BRIDGE_URL)return realFetch(url,init);const e=JSON.parse(init.body);assert.equal(e.signature,createHmac('sha256','qa-bridge').update(`${e.timestamp}.${e.nonce}.${JSON.stringify(e.payload)}`).digest('hex'));const p=e.payload,revision=Number(state.Meta[0].value);if(p.action==='read')return Response.json({ok:true,data:state,revision});if(p.expectedRevision!==revision)return Response.json({ok:false,status:409,error:'Conflict'});Object.assign(state,p.tables);return Response.json({ok:true,revision:p.revision});};
 const server=http.createServer((req,res)=>(req.url==='/api/auth'?auth:operations)(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let cookie='';const request=(path,method='GET',data)=>realFetch(origin+path,{method,headers:{origin,cookie,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 try{
  assert.equal((await request('/api/operations')).status,401);
  const login=await request('/api/auth','POST',{username:'admin',password:'qa-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  const before=await (await request('/api/operations')).json();assert.equal(before.revision,1);
  const edit={requestId:'integration-payment-01',expectedRevision:before.revision,changes:[{table:'Payments',create:true,record:{order_id:'O1',amount:24,currency:'AUD',date:'2026-10-09',kind:'payment',method:'QA only',reference:'',notes:''}}]};
  const saved=await (await request('/api/operations','POST',edit)).json();assert.equal(saved.revision,2);
  const after=await (await request('/api/operations')).json();assert.equal(after.data.Payments.length,1);assert.equal(after.data.Payments[0].amount,24);assert.equal(after.data.ActivityLog.length,1);
  assert.equal((await (await request('/api/operations','POST',edit)).json()).duplicate,true);
  assert.equal((await request('/api/operations','POST',{...edit,requestId:'integration-stale-02'})).status,409);
  const invalid={...edit,expectedRevision:2,requestId:'integration-bad-date',changes:[{...edit.changes[0],record:{...edit.changes[0].record,date:'2026-02-30'}}]};assert.equal((await request('/api/operations','POST',invalid)).status,400);
  assert.equal((await request('/api/auth','DELETE')).status,200);cookie='';assert.equal((await request('/api/operations')).status,401);
 }finally{globalThis.fetch=realFetch;await new Promise(r=>server.close(r));}
});
