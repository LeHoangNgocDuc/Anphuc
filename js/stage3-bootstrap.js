/**
 * Interim launcher for Student + Parent portals (Stage 3).
 * Stage 4 js/main.js will replace this launcher and wire Teacher portal.
 */
import { getDatabase, getDatabaseMode } from './db.js';
import { mountStudentPortal } from './portals/student.js';
import { mountParentPortal } from './portals/parent.js';
const showError = message => {
  for(const id of ['student-login-message','parent-login-message']){
    const node=document.getElementById(id);
    if(node){node.textContent=message;node.dataset.status='error';}
  }
};
function activePortal(){
  const id=decodeURIComponent(location.hash.slice(1));
  if(id.startsWith('student-'))return 'student';
  if(id.startsWith('parent-'))return 'parent';
  return '';
}
async function main(){
  const db=await getDatabase();
  // Stage2 Demo init defaults to admin for isolated workbook tests. The user
  // facing Student/Parent portal deliberately starts logged out and uses OTP.
  if(db.mode==='demo')await db.signOut();
  const student=mountStudentPortal({db});
  const parent=mountParentPortal({db});
  const activate=async()=>{
    const target=activePortal();
    try{
      if(target==='student')await student.activate();
      if(target==='parent')await parent.activate();
    }catch(e){showError(e.message);}
  };
  window.addEventListener('hashchange',activate);
  await activate();
  document.documentElement.dataset.backend=db.mode;
  if(db.mode==='demo'){
    const hint=document.createElement('div');
    hint.className='stage3-demo-ribbon';
    hint.textContent='CHẾ ĐỘ DEMO – dữ liệu giả lập, mã OTP 123456';
    document.body.append(hint);
  }
  // Useful for future Stage4: no authenticated user data is surfaced globally.
  document.dispatchEvent(new CustomEvent('anphuc-stage3-ready',{detail:{mode:getDatabaseMode()}}));
}
main().catch(error=>{console.error('Stage3 init:',error);showError(`Không thể khởi động: ${error.message}`);});
