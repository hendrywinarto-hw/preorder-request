import {readFile} from 'node:fs/promises';
import {respond,session} from '../lib/http.js';
export default async function handler(req,res){
 if(!session(req))return respond(res,401,{error:'Sign in to continue.'});
 if(req.method!=='GET')return respond(res,405,{error:'Method not allowed.'});
 res.setHeader('Cache-Control','private, no-store');
 if(req.query?.file==='manifest'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({timeZone:'Australia/Sydney',runtimeVersion:'V8',exceptionLogging:'STACKDRIVER',oauthScopes:['https://www.googleapis.com/auth/spreadsheets'],dependencies:{enabledAdvancedServices:[{userSymbol:'Sheets',serviceId:'sheets',version:'v4'}]}}));}
 if(req.query?.file==='script'){
  let script=await readFile(new URL('../google-sheets/Code.gs',import.meta.url),'utf8');script=script.replace('__SPREADSHEET_ID__',process.env.GOOGLE_SHEETS_ID||'').replace('__BRIDGE_SECRET__',process.env.GOOGLE_SHEETS_BRIDGE_SECRET||'');
  res.setHeader('Content-Type','text/plain');res.setHeader('Content-Disposition','attachment; filename="JustTitip-Bridge.gs"');return res.end(script);
 }
 respond(res,200,{connected:!!process.env.GOOGLE_SHEETS_BRIDGE_URL,databaseUrl:process.env.GOOGLE_SHEETS_DATABASE_URL||'',folderUrl:process.env.GOOGLE_DRIVE_FOLDER_URL||''});
}
