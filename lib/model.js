import {randomUUID} from 'node:crypto';
export const schemas={
Customers:['id','name','phone','email','address','notes'],
Products:['id','name','category','selling_price','currency','unit_weight_g','weight_status','active','notes'],
RetailerOffers:['id','product_id','retailer','cost','currency','url','checked_at','source','notes'],
Trips:['id','name','departure_date','cutoff_date','destinations','status','weight_limit_kg','source_weight_note'],
Orders:['id','reference','customer_id','trip_id','status','fulfilment_method','pickup_location','delivery_address','dropoff_location','notes','legacy_payment_status','legacy_payment_account','source'],
OrderItems:['id','order_id','product_id','type','description','quantity','unit_price','currency','source_total','estimated_weight_g','actual_weight_g','purchased_quantity','actual_unit_cost','cost_currency','status','notes','source'],
Payments:['id','order_id','amount','currency','date','kind','method','reference','notes'],
Settings:['key','value','description'],
ActivityLog:['id','request_id','action','record_id','operator','timestamp','details'],
ImportIssues:['id','record_type','record_id','field','message','status','source'],
Meta:['key','value']};
export const options={Orders:{status:['draft','quoted','confirmed','purchasing','packed','ready','completed','cancelled'],fulfilment_method:['','pickup','delivery']},OrderItems:{type:['product','custom','baggage'],status:['not_purchased','part_purchased','purchased','packed','handed_over','cancelled']},Trips:{status:['open','closed','departed','completed']},Products:{category:['Vitamin','Food','Skin Care','Other'],weight_status:['estimated','confirmed','needs_review']},Payments:{kind:['payment','refund']},ImportIssues:{status:['open','resolved']}};
const numberFields=new Set(['selling_price','unit_weight_g','cost','weight_limit_kg','quantity','unit_price','source_total','estimated_weight_g','actual_weight_g','purchased_quantity','actual_unit_cost','amount']);
export class ValidationError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fail=(m)=>{throw new ValidationError(m)};
export function validateRecord(table,raw,state){
 if(!schemas[table]||['Meta','ActivityLog'].includes(table))fail('This table cannot be edited.');
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('A record is required.');
 const r={};
 for(const k of schemas[table]){
  let v=raw[k]??'';
  if(numberFields.has(k)){if(v===''||v===null)v=null;else {v=Number(v);if(!Number.isFinite(v)||v<0||v>1e12)fail(`${k} must be a non-negative number.`);}}
  else if(k==='active'){if(![true,false,'true','false'].includes(v))fail('Active must be true or false.');v=v===true||v==='true';}
  else {if(typeof v==='object')fail(`Invalid ${k}.`);v=String(v);if(v.length>8000)fail(`${k} is too long.`);}
  r[k]=v;
 }
 for(const [k,allowed] of Object.entries(options[table]||{}))if(!allowed.includes(r[k]))fail(`Invalid ${k}.`);
 for(const k of ['currency','cost_currency'])if(k in r&&r[k]&&!['AUD','IDR','SGD'].includes(r[k]))fail('Choose AUD, IDR or SGD.');
 if('unit_price' in r&&r.unit_price!==null&&!r.currency)fail('Choose a currency for the quote.');
 if('actual_unit_cost' in r&&r.actual_unit_cost!==null&&!r.cost_currency)fail('Choose a currency for the purchase cost.');
 if('url' in r&&r.url){let u;try{u=new URL(r.url)}catch{fail('Enter a full product URL.')}if(!['http:','https:'].includes(u.protocol))fail('Product URL must use https or http.');}
 for(const k of ['date','departure_date','cutoff_date','checked_at'])if(r[k]){const d=new Date(r[k]+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(r[k])||Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==r[k])fail(`Invalid ${k}.`);}
 const foreign={Orders:{customer_id:'Customers',trip_id:'Trips'},OrderItems:{order_id:'Orders',product_id:'Products'},Payments:{order_id:'Orders'},RetailerOffers:{product_id:'Products'}};
 for(const [field,target] of Object.entries(foreign[table]||{}))if(r[field]&&!state[target]?.some(x=>x.id===r[field]))fail(`Unknown ${field}.`);
 if(['Customers','Products','Trips'].includes(table)&&!r.name.trim())fail('Name is required.');
 if(table==='Orders'){if(!r.trip_id)fail('Choose a trip.');if(r.fulfilment_method==='delivery'&&!r.delivery_address.trim())fail('Delivery address is required.');}
 if(table==='OrderItems'){
  if(!r.order_id||!r.description.trim())fail('Order and item description are required.');
  if(r.type!=='baggage'&&(r.quantity===null||r.quantity<1||!Number.isInteger(r.quantity)))fail('Product quantity must be a whole number of at least 1.');
  if(r.quantity!==null&&!Number.isInteger(r.quantity))fail('Quantity must be a whole number.');
  if(r.purchased_quantity===null)r.purchased_quantity=0;
  if(r.quantity!==null&&r.purchased_quantity>r.quantity)fail('Purchased quantity exceeds ordered quantity.');
  if(r.type==='baggage'&&r.quantity!==null&&r.quantity<1)fail('Service quantity must be at least 1, or blank for a fixed quote.');
 }
 if(table==='Payments'){if(!r.order_id||!r.currency||r.amount===null||r.amount<=0||!r.date)fail('Order, positive amount, currency and date are required.');}
 if(table==='Settings'){
  const allowed=['weight_fee_aud_per_kg','markup_percent','aud_idr_rate','weight_rounding_kg'];if(!allowed.includes(r.key))fail('Unknown setting.');
  if(r.value!==''){const n=Number(r.value);if(!Number.isFinite(n)||n<0||(['aud_idr_rate','weight_rounding_kg'].includes(r.key)&&n<=0))fail('Enter a valid positive setting.');r.value=n;}
 }
 return r;
}
export function prepareMutation(state,request,operator='admin'){
 if(!request||!Array.isArray(request.changes)||request.changes.length<1||request.changes.length>100)fail('Provide 1–100 record changes.');
 if(!/^[\w-]{8,100}$/.test(request.requestId||''))fail('Invalid request ID.');
 const revision=Number(state.Meta?.find(x=>x.key==='revision')?.value||0);
 if(Number(request.expectedRevision)!==revision)throw new ValidationError('This data changed. Refresh before saving.',409);
 const next=structuredClone(state),changed=new Set(),ids=[],audit=[];
 for(const change of request.changes){
  const {table}=change;if(!schemas[table]||['ActivityLog','Meta'].includes(table))fail('Invalid table.');
  const key=table==='Settings'?'key':'id';const raw={...change.record};
  if(!raw[key])raw[key]=`${table.slice(0,3).toUpperCase()}-${randomUUID()}`;
  const existing=next[table].find(x=>x[key]===raw[key]);
  if(change.create&&existing)fail('This record already exists.');
  if(!change.create&&!existing)fail('The record no longer exists.');
  // Server owns provenance and retained source totals. An explicit edited quote replaces source_total.
  if(existing){for(const k of ['source','legacy_payment_status','legacy_payment_account'])if(k in existing)raw[k]=existing[k];
   if(table==='OrderItems')raw.source_total=existing.source_total;
  }
  if(table==='Orders'&&!raw.reference)raw.reference=existing?.reference||`JT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${raw.id.slice(-6).toUpperCase()}`;
  const r=validateRecord(table,raw,next);
  if(table==='OrderItems'&&existing&&(['quantity','unit_price','currency'].some(k=>String(r[k]??'')!==String(existing[k]??''))))r.source_total=null;
  if(table==='Orders'&&next.Orders.some(x=>x.reference===r.reference&&x.id!==r.id))fail('Order reference already exists.');
  const index=next[table].findIndex(x=>x[key]===r[key]);if(index<0)next[table].push(r);else next[table][index]=r;
  ids.push(r[key]);changed.add(table);const differences=Object.fromEntries(Object.keys(r).filter(k=>JSON.stringify(existing?.[k])!==JSON.stringify(r[k])).map(k=>[k,{before:existing?.[k]??null,after:r[k]}]));audit.push({table,record_id:r[key],changes:differences});
 }
 const now=new Date().toISOString();for(const a of audit){const details=JSON.stringify(a.changes);if(details.length>45000)fail('This edit is too large to record in the change history.');next.ActivityLog.push({id:'LOG-'+randomUUID(),request_id:request.requestId,action:'save '+a.table,record_id:a.record_id,operator,timestamp:now,details});}changed.add('ActivityLog');
 next.Meta=next.Meta.map(r=>r.key==='revision'?{...r,value:revision+1}:r);changed.add('Meta');
 return {expectedRevision:revision,requestId:request.requestId,tables:Object.fromEntries([...changed].map(k=>[k,next[k]])),revision:revision+1,ids};
}
export function lineTotal(item){if(item.status==='cancelled')return 0;if(item.source_total!==null&&item.source_total!==undefined&&item.source_total!=='')return Number(item.source_total);if(item.unit_price===null||item.unit_price===undefined||item.unit_price==='')return null;return Math.round(Number(item.unit_price)*Number(item.quantity||1)*100)/100;}
