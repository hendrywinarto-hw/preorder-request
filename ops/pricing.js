export function estimateQuote({cost,weightGrams,quantity=1,fee,markup,rounding,rate}) {
 const values=[cost,weightGrams,quantity,fee,markup,rounding];
 if(values.some(v=>v===''||v===null||v===undefined||!Number.isFinite(Number(v)))||values.some(v=>Number(v)<0)||Number(quantity)<1||!Number.isInteger(Number(quantity))||Number(rounding)<=0)throw new Error('Enter cost, total weight, quantity and all pricing defaults.');
 const billableKg=Math.ceil((Number(weightGrams)/1000)/Number(rounding))*Number(rounding);
 const purchase=Number(cost)*Number(quantity),shipping=billableKg*Number(fee);
 const aud=Math.round((purchase*(1+Number(markup)/100)+shipping)*100)/100;
 return {aud,shipping,billableKg,idr:rate!==''&&rate!==null&&rate!==undefined&&Number.isFinite(Number(rate))&&Number(rate)>0?Math.round(aud*Number(rate)):null};
}
