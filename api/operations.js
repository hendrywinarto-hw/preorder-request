import {respond,session,body,sameOrigin,bridge} from '../lib/http.js';
import {prepareMutation} from '../lib/model.js';
export default async function handler(req,res){
 const user=session(req);if(!user)return respond(res,401,{error:'Sign in to continue.'});
 try{
  if(req.method==='GET'){const r=await bridge({action:'read'});return respond(res,200,{data:r.data,revision:r.revision});}
  if(req.method!=='POST')return respond(res,405,{error:'Method not allowed.'});
  if(!sameOrigin(req))return respond(res,403,{error:'Invalid origin.'});
  const request=await body(req);
  const snapshot=await bridge({action:'read'});
  const prior=snapshot.data.ActivityLog.find(r=>r.request_id===request.requestId);if(prior)return respond(res,200,{ok:true,duplicate:true,revision:snapshot.revision});
  const mutation=prepareMutation(snapshot.data,request,user.user);
  const result=await bridge({action:'commit',...mutation});return respond(res,200,{ok:true,revision:result.revision,ids:mutation.ids});
 }catch(e){respond(res,e.status||502,{error:e.message,code:e.code||'storage_error'});}
}
