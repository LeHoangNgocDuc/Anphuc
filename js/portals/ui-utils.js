/** Shared browser-safe DOM helpers for Student & Parent portals. */
import { moneyVN, dateVN } from '../config.js';
export { moneyVN, dateVN };
export const one = (root,id) => root.getElementById(id);
export function elt(tag,attrs={},...children){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(value===undefined||value===null||value===false)continue;
    if(key==='class')node.className=value;
    else if(key==='text')node.textContent=String(value);
    else if(key==='dataset')for(const [k,v] of Object.entries(value))node.dataset[k]=String(v);
    else if(key==='disabled')node.disabled=Boolean(value);
    else if(key==='checked')node.checked=Boolean(value);
    else if(key==='value')node.value=String(value);
    else node.setAttribute(key,value===true?'':String(value));
  }
  for(const child of children.flat(Infinity))if(child!==null&&child!==undefined){
    node.append(child instanceof Node?child:document.createTextNode(String(child)));
  }
  return node;
}
export function replace(parent,...nodes){parent.replaceChildren(...nodes);}
export function status(node,message,kind='info'){
  node.textContent=message;
  node.dataset.status=kind;
}
export function formatScore(value){return (Number(value)||0).toFixed(2);}
export function renderMath(container){
  if(typeof window.renderMathInElement!=='function')return;
  try{
    window.renderMathInElement(container,{
      delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},
        {left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false}],
      throwOnError:false,trust:false,
    });
  }catch(err){console.warn('KaTeX:',err);}
}
function imageUrl(raw){
  try { const u=new URL(String(raw)); return u.protocol==='https:' && /\.(?:png|jpe?g|webp|gif)$/i.test(u.pathname) ? u.href : null; }
  catch{return null;}
}
/** All question/explanation content enters as text, NEVER unsanitized HTML. */
export function addRichText(container,raw){
  const value=String(raw??'');
  const regex=/https:\/\/[^\s<>'"`]+/g;
  let pos=0,match;
  while((match=regex.exec(value))){
    if(match.index>pos)container.append(document.createTextNode(value.slice(pos,match.index)));
    const url=imageUrl(match[0].replace(/[.,;)]$/,''));
    if(url){
      container.append(elt('figure',{class:'stage3-image'},
        elt('img',{src:url,alt:'Hình minh họa câu hỏi',loading:'lazy',decoding:'async',referrerpolicy:'no-referrer'})));
    } else container.append(document.createTextNode(match[0]));
    pos=regex.lastIndex;
  }
  if(pos<value.length)container.append(document.createTextNode(value.slice(pos)));
  renderMath(container);
}
export function controlledButton(label,onClick,cls='btn btn-primary'){
  const button=elt('button',{type:'button',class:cls,text:label});
  button.addEventListener('click',onClick);
  return button;
}
export function emptyBlock(text){return elt('div',{class:'stage3-empty',text});}
export function showModal(dialog){if(!dialog.open)dialog.showModal();}
export function monthLabel(row){return `${String(row.tuition_month??'').padStart(2,'0')}/${row.tuition_year??''}`;}
