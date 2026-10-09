// Keep the original nodes so icons and event handlers survive a busy state.
export async function withButton(button,label,task,{status,slowAfter=8000,paint=true}={}){
 if(!button||button.getAttribute('aria-busy')==='true')return;
 const nodes=[...button.childNodes],disabled=button.disabled,ariaLabel=button.getAttribute('aria-label');
 const spinner=button.ownerDocument.createElement('span');spinner.className='button-spinner';spinner.setAttribute('aria-hidden','true');
 const text=button.ownerDocument.createElement('span');text.className='button-progress-label';text.textContent=label;
 const content=button.ownerDocument.createElement('span');content.hidden=true;content.append(...nodes);
 button.replaceChildren(content,spinner,text);button.disabled=true;button.setAttribute('aria-busy','true');button.setAttribute('aria-label',label);
 const token={};let timer;
 if(status){status.activeAction=token;status.textContent=label;status.hidden=false;timer=setTimeout(()=>{if(status.activeAction===token)status.textContent=label+' This is taking a little longer. Please wait.';},slowAfter);}
 try{
  // Background tabs can pause animation frames; processing must still start.
  if(paint)await new Promise(resolve=>{const timer=setTimeout(resolve,100);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});
  return await task();
 }finally{
  clearTimeout(timer);button.replaceChildren(...nodes);button.disabled=disabled;button.removeAttribute('aria-busy');
  if(ariaLabel===null)button.removeAttribute('aria-label');else button.setAttribute('aria-label',ariaLabel);
  if(status?.activeAction===token){status.hidden=true;delete status.activeAction;}
 }
}
