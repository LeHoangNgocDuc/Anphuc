/** Name -> student suggestion -> registered phone, DEMO DATA ONLY.
 * Not suitable as production authentication. Real mode retains verified auth.
 */
import {normalizePhone} from '../config.js';
import {elt,replace,status} from './ui-utils.js';

const get=id=>document.getElementById(id);

export function mountNamePhoneDemo({db,portal,originalForm,message,onLogin}){
  if(db.mode!=='demo')return null;
  originalForm.hidden=true;
  const panel=originalForm.closest('.panel-card');
  const title=panel?.querySelector('h2');
  const subtitle=panel?.querySelector('.panel-subtitle');
  if(title)title.textContent='Ch\u1ecdn h\u1ecdc sinh \u0111\u1ec3 \u0111\u0103ng nh\u1eadp';
  if(subtitle)subtitle.textContent='G\u00f5 t\u00ean, ch\u1ecdn t\u00ean trong g\u1ee3i \u00fd, sau \u0111\u00f3 nh\u1eadp s\u1ed1 \u0111i\u1ec7n tho\u1ea1i \u0111\u0103ng k\u00fd.';
  const otpHint=get('student-phone-help');
  if(portal==='student' && otpHint)otpHint.hidden=true;
  const root=elt('section',{class:'namephone-shell',id:`${portal}-namephone-shell`});
  const heading=elt('h3',{text:'T\u00ecm h\u1ecdc sinh b\u1eb1ng h\u1ecd t\u00ean'});
  const hint=elt('p',{class:'note',text:'Nh\u1eadp t\u00ean h\u1ecdc sinh, ch\u1ecdn \u0111\u00fang g\u1ee3i \u00fd, r\u1ed3i nh\u1eadp s\u1ed1 \u0111i\u1ec7n tho\u1ea1i \u0111\u00e3 \u0111\u0103ng k\u00fd.'});
  const form=elt('form',{id:`${portal}-namephone-form`,class:'namephone-form',autocomplete:'off'});
  const nameId=`${portal}-namephone-name`,phoneId=`${portal}-namephone-phone`,resultsId=`${portal}-namephone-results`;
  const name=elt('input',{class:'input',id:nameId,type:'search',autocomplete:'off',maxlength:150,placeholder:'Nh\u1eadp h\u1ecd ho\u1eb7c t\u00ean...',required:true,'aria-controls':resultsId,'aria-expanded':'false'});
  const resultList=elt('div',{class:'namephone-results',id:resultsId,role:'listbox','aria-label':'G\u1ee3i \u00fd h\u1ecdc sinh'});
  resultList.hidden=true;
  const selectedLabel=elt('p',{class:'namephone-selected',role:'status',text:'Ch\u01b0a ch\u1ecdn h\u1ecdc sinh.'});
  const phone=elt('input',{class:'input',id:phoneId,type:'tel',inputmode:'numeric',autocomplete:'tel',pattern:'0[0-9]{9}',maxlength:10,placeholder:'0xxxxxxxxx',required:true});
  const button=elt('button',{type:'submit',class:'btn btn-primary',text:'V\u00e0o t\u00e0i kho\u1ea3n h\u1ecdc sinh'});
  const searchField=elt('div',{class:'field namephone-search-field'},elt('label',{for:nameId,text:'H\u1ecd v\u00e0 t\u00ean h\u1ecdc sinh'}),name,resultList);
  const phoneField=elt('div',{class:'field'},elt('label',{for:phoneId,text:'S\u1ed1 \u0111i\u1ec7n tho\u1ea1i ph\u1ee5 huynh \u0111\u0103ng k\u00fd'}),phone);
  const demoNote=elt('p',{class:'note namephone-warning',text:'Ch\u1ec9 ch\u1ea1y tr\u00ean d\u1eef li\u1ec7u DEMO gi\u1ea3 \u0111\u1ecbnh. \u0110\u0103ng nh\u1eadp th\u1eadt v\u1eabn c\u1ea7n m\u1ed9t y\u1ebfu t\u1ed1 b\u1ea3o v\u1ec7 ri\u00eang nh\u01b0 m\u00e3 truy c\u1eadp do Trung t\u00e2m c\u1ea5p.'});
  form.append(searchField,selectedLabel,phoneField,button);
  root.append(heading,hint,form,demoNote);
  originalForm.after(root);
  status(message,'Nh\u1eadp t\u00ean h\u1ecdc sinh \u0111\u1ec3 t\u00ecm g\u1ee3i \u00fd. Kh\u00f4ng c\u1ea7n OTP \u1edf ch\u1ebf \u0111\u1ed9 Demo.');
  let selected=null,searchSeq=0;
  function clearSelection(){selected=null;selectedLabel.textContent='Ch\u01b0a ch\u1ecdn h\u1ecdc sinh.';}
  function hideResults(){resultList.hidden=true;name.setAttribute('aria-expanded','false');}
  async function search(){
    const seq=++searchSeq;
    clearSelection();
    const term=name.value.trim();
    if(term.length<2){replace(resultList);hideResults();return;}
    try{
      const matches=await db.searchDemoStudents(term);
      if(seq!==searchSeq)return;
      replace(resultList);
      if(!matches.length){
        resultList.append(elt('p',{class:'note',text:'Kh\u00f4ng t\u00ecm th\u1ea5y h\u1ecdc sinh ph\u00f9 h\u1ee3p.'}));
      }else{
        matches.forEach(student=>{
          const option=elt('button',{type:'button',class:'namephone-option',role:'option',text:`${student.full_name} \u00b7 L\u1edbp ${student.class_name}`,'aria-selected':'false'});
          option.addEventListener('click',()=>{
            selected=student;
            name.value=student.full_name;
            selectedLabel.textContent=`\u0110\u00e3 ch\u1ecdn: ${student.full_name} \u00b7 L\u1edbp ${student.class_name}`;
            hideResults();phone.focus();
          });
          resultList.append(option);
        });
      }
      resultList.hidden=false;name.setAttribute('aria-expanded','true');
    }catch(error){hideResults();status(message,error.message,'error');}
  }
  name.addEventListener('input',search);
  name.addEventListener('keydown',e=>{
    if(e.key==='Escape')hideResults();
    if(e.key==='ArrowDown'&&!resultList.hidden){e.preventDefault();resultList.querySelector('button')?.focus();}
  });
  resultList.addEventListener('keydown',e=>{
    if(e.key==='Escape'){hideResults();name.focus();}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      const options=[...resultList.querySelectorAll('button')];
      const i=options.indexOf(document.activeElement);
      if(i<0)return;
      e.preventDefault();options[(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();
    }
  });
  form.addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!selected){status(message,'Vui l\u00f2ng ch\u1ecdn \u0111\u00fang h\u1ecdc sinh t\u1eeb danh s\u00e1ch g\u1ee3i \u00fd.','error');name.focus();return;}
    const normalized=normalizePhone(phone.value);
    if(!normalized){status(message,'S\u1ed1 \u0111i\u1ec7n tho\u1ea1i ph\u1ea3i c\u00f3 10 ch\u1eef s\u1ed1.','error');phone.focus();return;}
    button.disabled=true;status(message,'\u0110ang \u0111\u1ed1i chi\u1ebfu th\u00f4ng tin...');
    try{
      await db.signInDemoByStudentPhone({studentId:selected.id,phone:normalized});
      status(message,`\u0110\u0103ng nh\u1eadp th\u00e0nh c\u00f4ng: ${selected.full_name}.`,'success');
      await onLogin(selected);
    }catch(error){status(message,error.message,'error');}
    finally{button.disabled=false;}
  });
  return {root};
}
