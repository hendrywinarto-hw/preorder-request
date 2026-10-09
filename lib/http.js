import {createHmac,timingSafeEqual,scryptSync,randomBytes} from 'node:crypto';
export function respond(res,status,data){res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');res.statusCode=status;res.end(JSON.stringify(data));}
export function session(req){
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('jt_session='))?.slice(11);if(!token||!process.env.SESSION_SECRET)return null;
 const [body,sig]=token.split('.');if(!body||!sig)return null;const expected=createHmac('sha256',process.env.SESSION_SECRET).update(body).digest('base64url');
 if(expected.length!==sig.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))return null;
 try{const s=JSON.parse(Buffer.from(body,'base64url'));return s.exp>Date.now()&&s.user==='admin'?s:null}catch{return null}
}
export function loginCookie(){const body=Buffer.from(JSON.stringify({user:'admin',exp:Date.now()+8*3600000,nonce:randomBytes(12).toString('hex')})).toString('base64url');return `jt_session=${body}.${createHmac('sha256',process.env.SESSION_SECRET).update(body).digest('base64url')}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`;}
export function sameOrigin(req){const o=req.headers.origin;if(!o)return false;try{return new URL(o).host===req.headers.host}catch{return false}}
export async function body(req){let v=req.body;if(v===undefined){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>256000)throw new Error('Request is too large.')}v=raw;}if(typeof v==='string'){if(Buffer.byteLength(v)>256000)throw new Error('Request is too large.');v=JSON.parse(v);}return v;}
export function checkPassword(p){const [salt,hash]=(process.env.ADMIN_PASSWORD_HASH||'').split(':');if(!salt||!hash)return false;const actual=scryptSync(String(p).slice(0,256),salt,64).toString('hex');return actual.length===hash.length&&timingSafeEqual(Buffer.from(actual),Buffer.from(hash));}
export async function bridge(payload){
 const endpoint=process.env.GOOGLE_SHEETS_BRIDGE_URL,secret=process.env.GOOGLE_SHEETS_BRIDGE_SECRET;if(!endpoint||!secret){const e=new Error('Google Sheets connection needs its one-time deployment setup.');e.status=503;e.code='setup_required';throw e;}
 const u=new URL(endpoint);if(u.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(u.pathname))throw new Error('Invalid Google Sheets bridge URL.');
 const envelope={timestamp:Date.now(),nonce:randomBytes(16).toString('hex'),payload};envelope.signature=createHmac('sha256',secret).update(`${envelope.timestamp}.${envelope.nonce}.${JSON.stringify(payload)}`).digest('hex');
 const response=await fetch(endpoint,{method:'POST',body:JSON.stringify(envelope),headers:{'Content-Type':'application/json'},redirect:'follow',signal:AbortSignal.timeout(25000)});
 let result;try{result=await response.json()}catch{throw new Error('Google Sheets bridge did not return JSON. Check deployment access.');}
 if(!response.ok||!result.ok){const e=new Error(result.error||'Google Sheets could not complete this request.');e.status=result.status||502;throw e;}return result;
}
