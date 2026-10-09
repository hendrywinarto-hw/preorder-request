import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {scryptSync,createHmac} from 'node:crypto';import {fixture} from './fixtures.mjs';import auth from '../api/auth.js';import operations from '../api/operations.js';
test('HTTP login, read, payment save, refresh, idempotent retry, conflict and logout',async()=>{
 let state=fixture(),bridgeCalls=0;process.env.SESSION_SECRET='integration-session';process.env.ADMIN_PASSWORD_HASH='qa:'+scryptSync('qa-password','qa',64).toString('hex');process.env.GOOGLE_SHEETS_BRIDGE_SECRET='qa-bridge';process.env.GOOGLE_SHEETS_BRIDGE_URL='https://script.google.com/macros/s/QA_ONLY/exec';
 const realFetch=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(url!==process.env.GOOGLE_SHEETS_BRIDGE_URL)return realFetch(url,init);bridgeCalls++;const e=JSON.parse(init.body);assert.equal(e.signature,createHmac('sha256','qa-bridge').update(`${e.timestamp}.${e.nonce}.${JSON.stringify(e.payload)}`).digest('hex'));const p=e.payload,revision=Number(state.Meta[0].value);if(p.action==='read')return Response.json({ok:true,data:state,revision});if(p.expectedRevision!==revision)return Response.json({ok:false,status:409,error:'Conflict'});Object.assign(state,p.tables);return Response.json({ok:true,revision:p.revision});};
 const server=http.createServer((req,res)=>(req.url==='/api/auth'?auth:operations)(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let cookie='';const request=(path,method='GET',data)=>realFetch(origin+path,{method,headers:{origin,cookie,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 try{
  assert.equal((await request('/api/operations')).status,401);
  const login=await request('/api/auth','POST',{username:'admin',password:'qa-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  const before=await (await request('/api/operations')).json();assert.equal(before.revision,1);
  const edit={requestId:'integration-payment-01',expectedRevision:before.revision,changes:[{table:'Payments',create:true,record:{order_id:'O1',amount:24,currency:'AUD',date:'2026-10-09',kind:'payment',method:'QA only',reference:'',notes:''}}]};
  const callsBeforeSave=bridgeCalls;const saved=await (await request('/api/operations','POST',edit)).json();assert.equal(saved.revision,2);assert.equal(bridgeCalls-callsBeforeSave,2,'normal saves need only read + commit');assert.equal(saved.data.Payments.length,1);assert.equal(saved.data.Payments[0].id,saved.ids[0]);assert.equal(saved.data.Meta[0].value,2);
  const after=await (await request('/api/operations')).json();assert.equal(after.data.Payments.length,1);assert.equal(after.data.Payments[0].amount,24);assert.equal(after.data.ActivityLog.length,1);
  const retry=await (await request('/api/operations','POST',edit)).json();assert.equal(retry.duplicate,true);assert.equal(retry.data.Payments.length,1);assert.equal(retry.ids[0],saved.ids[0]);
  assert.equal((await request('/api/operations','POST',{...edit,requestId:'integration-stale-02'})).status,409);
  const invalid={...edit,expectedRevision:2,requestId:'integration-bad-date',changes:[{...edit.changes[0],record:{...edit.changes[0].record,date:'2026-02-30'}}]};assert.equal((await request('/api/operations','POST',invalid)).status,400);
  assert.equal((await request('/api/auth','DELETE')).status,200);cookie='';assert.equal((await request('/api/operations')).status,401);
 }finally{globalThis.fetch=realFetch;await new Promise(r=>server.close(r));}
});

test('a concurrent retry returns the committed IDs and current data',async()=>{
 let state=fixture(),reads=0;
 process.env.SESSION_SECRET='retry-session';process.env.GOOGLE_SHEETS_BRIDGE_SECRET='qa-bridge';process.env.GOOGLE_SHEETS_BRIDGE_URL='https://script.google.com/macros/s/QA_RETRY/exec';
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  if(url!==process.env.GOOGLE_SHEETS_BRIDGE_URL)return realFetch(url,init);
  const p=JSON.parse(init.body).payload;
  if(p.action==='read'){reads++;return Response.json({ok:true,data:state,revision:Number(state.Meta[0].value)});}
  // Another request won the commit race with its own generated record ID.
  state.Customers.push({id:'CONCURRENT-ID',name:'Retry customer',phone:'',email:'',address:'',notes:''});
  state.ActivityLog.push({id:'CONCURRENT-LOG',request_id:p.requestId,record_id:'CONCURRENT-ID'});state.Meta[0].value=2;
  return Response.json({ok:true,duplicate:true,revision:2});
 };
 const server=http.createServer(operations);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const b=Buffer.from(JSON.stringify({user:'admin',exp:Date.now()+60000})).toString('base64url');
 const cookie='jt_session='+b+'.'+createHmac('sha256','retry-session').update(b).digest('base64url');
 try{
  const result=await (await realFetch(origin+'/api/operations',{method:'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:JSON.stringify({requestId:'qa-concurrent-retry',expectedRevision:1,changes:[{table:'Customers',create:true,record:{name:'Retry customer'}}]})})).json();
  assert.equal(result.duplicate,true);assert.equal(result.revision,2);assert.deepEqual(result.ids,['CONCURRENT-ID']);assert.equal(result.data.Customers.length,2);assert.equal(reads,2);
 }finally{globalThis.fetch=realFetch;await new Promise(r=>server.close(r));}
});
