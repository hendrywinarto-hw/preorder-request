import {respond,session,body,sameOrigin,checkPassword,loginCookie} from '../lib/http.js';
export default async function handler(req,res){
 if(req.method==='GET')return respond(res,200,{authenticated:!!session(req)});
 if(!sameOrigin(req))return respond(res,403,{error:'Invalid origin.'});
 if(req.method==='DELETE'){res.setHeader('Set-Cookie','jt_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return respond(res,200,{ok:true})}
 if(req.method!=='POST')return respond(res,405,{error:'Method not allowed.'});
 try{const b=await body(req);if(b.username!=='admin'||!checkPassword(b.password)){await new Promise(r=>setTimeout(r,700));return respond(res,401,{error:'Incorrect username or password.'});}res.setHeader('Set-Cookie',loginCookie());respond(res,200,{ok:true});}catch{respond(res,400,{error:'Unable to sign in.'})}
}
