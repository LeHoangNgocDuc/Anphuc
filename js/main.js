/** An Phuc LMS - Stage 4 integrated launcher (Student + Parent + Teacher). */
import {getDatabase} from './db.js';
import {mountStudentPortal} from './portals/student.js';
import {mountParentPortal} from './portals/parent.js';
import {mountTeacherPortal} from './portals/teacher.js';

function currentPortal(){
  const hash=decodeURIComponent(location.hash.slice(1));
  if(hash.startsWith('student-'))return 'student';
  if(hash.startsWith('parent-'))return 'parent';
  if(hash.startsWith('teacher-'))return 'teacher';
  return 'landing';
}
function errorToScreen(error){
  console.error('An Phuc LMS:',error);
  const portal=currentPortal();
  const id=({student:'student-login-message',parent:'parent-login-message',teacher:'teacher-auth-state'})[portal];
  const node=id?document.getElementById(id):null;
  if(node){node.textContent=`Không thể tải dữ liệu: ${error.message}`;node.dataset.status='error';}
  else {
    const note=document.getElementById('app-init-error')||document.createElement('p');
    note.id='app-init-error';note.className='app-wrap note';note.textContent=`Không thể khởi động: ${error.message}`;
    document.querySelector('main')?.prepend(note);
  }
}
async function main(){
  const db=await getDatabase();
  // Demo must never grant staff access silently on the public landing page.
  if(db.mode==='demo')await db.signOut();
  let student=null,parent=null,teacher=null;
  student=mountStudentPortal({db,onAuthChange:()=>{parent?.reset();teacher?.reset();}});
  parent=mountParentPortal({db,onAuthChange:()=>{student?.reset();teacher?.reset();}});
  teacher=mountTeacherPortal({db,onAuthChange:()=>{student?.reset();parent?.reset();}});
  const switchView=async()=>{
    try{
      const key=currentPortal();
      if(key==='student')await student.activate();
      else if(key==='parent')await parent.activate();
      else if(key==='teacher')await teacher.activate();
    }catch(error){errorToScreen(error);}
  };
  window.addEventListener('hashchange',switchView);
  document.documentElement.dataset.backend=db.mode;
  if(db.mode==='demo'){
    const ribbon=document.createElement('div');ribbon.className='stage3-demo-ribbon';
    ribbon.textContent='CHẾ ĐỘ DEMO · dữ liệu giả định · OTP 123456 · không nhập dữ liệu cá nhân thật';
    document.body.append(ribbon);
  }
  await switchView();
}
main().catch(errorToScreen);
