// Generated for the signed-in operator by /api/setup?file=script.
// Deploy as yourself, with access set to Anyone. Requests require a signed envelope.
const DATABASE_ID = '__SPREADSHEET_ID__';
const BRIDGE_SECRET = '__BRIDGE_SECRET__';
const TABLES = ['Customers','Products','RetailerOffers','Trips','Orders','OrderItems','Payments','Settings','ActivityLog','ImportIssues','Meta'];
function json_(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ok:false,error:'Signed POST required.',status:405}); }
function doPost(e) {
 const lock=LockService.getScriptLock();
 try {
  const envelope=JSON.parse(e.postData.contents),p=envelope.payload;
  if(Math.abs(Date.now()-Number(envelope.timestamp))>300000 || !/^[a-f0-9]{32}$/.test(envelope.nonce||''))throw new Error('Expired or invalid request.');
  const sign=Utilities.computeHmacSha256Signature(envelope.timestamp+'.'+envelope.nonce+'.'+JSON.stringify(p),BRIDGE_SECRET).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  let different=sign.length!==(envelope.signature||'').length;for(let i=0;i<sign.length;i++)different|=sign.charCodeAt(i)^(envelope.signature||'').charCodeAt(i);
  if(different)throw new Error('Unauthorized request.');
  if(!lock.tryLock(20000))return json_({ok:false,status:503,error:'Database is busy. Refresh before retrying.'});
  const cache=CacheService.getScriptCache();if(cache.get(envelope.nonce))throw new Error('Request has already been used.');cache.put(envelope.nonce,'1',600);
  const book=SpreadsheetApp.openById(DATABASE_ID),data={},sheets={};
  TABLES.forEach(name=>{const s=book.getSheetByName(name);if(!s)throw new Error('Missing database table '+name);sheets[name]=s;const rows=s.getDataRange().getValues(),headers=rows.shift();data[name]=rows.filter(row=>row[0]!==''&&row[0]!==null).map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i] instanceof Date?Utilities.formatDate(row[i],'Australia/Sydney','yyyy-MM-dd'):row[i]])));});
  const revision=Number(data.Meta.find(x=>x.key==='revision').value);
  if(p.action==='read')return json_({ok:true,data,revision});
  if(p.action!=='commit')throw new Error('Unsupported action.');
  if(data.ActivityLog.some(x=>x.request_id===p.requestId))return json_({ok:true,revision,duplicate:true});
  if(Number(p.expectedRevision)!==revision)return json_({ok:false,status:409,error:'This data changed. Refresh before saving.'});
  if(p.revision!==revision+1||!p.tables||!p.tables.Meta||!p.tables.ActivityLog)throw new Error('Invalid transaction.');
  if(Number(p.tables.Meta.find(x=>x.key==='revision').value)!==revision+1)throw new Error('Invalid revision.');
  const requests=[],structure=Sheets.Spreadsheets.get(DATABASE_ID,{fields:'sheets(properties(sheetId),tables(tableId,range))'});
  for(const name of Object.keys(p.tables)) {
   if(!TABLES.includes(name))throw new Error('Invalid table.');const s=sheets[name],headers=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];const records=p.tables[name];
   if(!Array.isArray(records)||records.length>5000)throw new Error('Invalid record count.');
   if(records.length+1>s.getMaxRows())requests.push({appendDimension:{sheetId:s.getSheetId(),dimension:'ROWS',length:records.length+1-s.getMaxRows()}});
   const rows=records.map(record=>({values:headers.map(key=>{const v=record[key];return v===null||v===undefined||v===''?{}:{userEnteredValue:typeof v==='number'?{numberValue:v}:typeof v==='boolean'?{boolValue:v}:{stringValue:String(v)}};})}));
   if(rows.length)requests.push({updateCells:{range:{sheetId:s.getSheetId(),startRowIndex:1,endRowIndex:rows.length+1,startColumnIndex:0,endColumnIndex:headers.length},rows,fields:'userEnteredValue'}});
   if(s.getLastRow()>records.length+1)requests.push({repeatCell:{range:{sheetId:s.getSheetId(),startRowIndex:records.length+1,endRowIndex:s.getLastRow(),startColumnIndex:0,endColumnIndex:headers.length},cell:{},fields:'userEnteredValue'}});
   const nativeSheet=structure.sheets.find(x=>x.properties.sheetId===s.getSheetId()),table=(nativeSheet.tables||[])[0];
   const range={sheetId:s.getSheetId(),startRowIndex:0,endRowIndex:records.length+1,startColumnIndex:0,endColumnIndex:headers.length};
   if(table)requests.push({updateTable:{table:{tableId:table.tableId,range},fields:'range'}});
   else if(records.length)requests.push({addTable:{table:{name:name+'Table',range}}});
  }
  // One atomic Sheets batch commits all changed tables, the receipt, and the revision.
  Sheets.Spreadsheets.batchUpdate({requests},DATABASE_ID);
  return json_({ok:true,revision:revision+1});
 } catch(error) {return json_({ok:false,status:400,error:error.message});}
 finally {if(lock.hasLock())lock.releaseLock();}
}
