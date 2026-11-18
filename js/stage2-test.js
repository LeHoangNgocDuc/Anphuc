import {getDatabase, getDatabaseMode, importWorkbookData} from './db.js';
import {parseExcelFile} from './excel-parser.js';
const $=id=>document.getElementById(id);
let db=null,parsed=null;
const say=(message,error=false)=>{ $(error?'stage2-error':'stage2-status').textContent=message; if(!error)$('stage2-error').textContent=''; };
const td=(text)=>{const el=document.createElement('td');el.textContent=String(text??'');return el;};
const fillTable=(id,rows,empty,mapper)=>{
  const tbody=$(id);tbody.replaceChildren();
  if(!rows.length){const tr=document.createElement('tr'),cell=td(empty);cell.colSpan=id==='stage2-student-list'?3:4;tr.append(cell);tbody.append(tr);return;}
  for(const item of rows){const tr=document.createElement('tr');mapper(item).forEach(x=>tr.append(td(x)));tbody.append(tr);}
};
const progress=event=>{
  $('stage2-progress').value=Number(event.percent??0);
  $('stage2-progress-status').textContent=`${event.phase}: ${event.percent??0}%${event.message?' – '+event.message:''}`;
};
async function refresh(){
  if(!db)return;
  const session=await db.getSession();
  const students=await db.getStudents();
  $('kpi-students').textContent=String(students.length);
  $('kpi-mode').textContent=db.mode==='demo'?'LOCAL DEMO':'SUPABASE';
  if(session.role==='admin'||session.role==='teacher'){
    const questions=await db.getTeacherQuestions();$('kpi-questions').textContent=String(questions.length);
  } else $('kpi-questions').textContent='(cần GV)';
  fillTable('stage2-student-list',students.slice(0,30),'Chưa có học sinh.',x=>[x.student_code,x.full_name,x.class_name]);
  $('stage2-auth-status').textContent=`Quyền hiện tại: ${session.role}${db.mode==='demo'?' (mô phỏng)':''}`;
}
async function init(){
  try{
    say('Đang khởi tạo tầng dữ liệu...');
    db=await getDatabase();
    $('btn-stage2-reset').hidden=db.mode!=='demo';
    $('mode-explainer').textContent=db.mode==='demo'
      ?'Đang chạy chế độ DEMO với dữ liệu hoàn toàn giả định. Dữ liệu lưu trong IndexedDB hoặc bộ nhớ trình duyệt. KHÔNG nhập thông tin cá nhân thật để chạy Demo công khai.'
      :'Đã kết nối Supabase. Chỉ giáo viên được phân quyền mới có thể nhập dữ liệu. Nếu đăng xuất, danh sách chỉ hiển thị theo RLS.';
    await refresh();say('Đã khởi tạo. Bạn có thể thử tải file Excel hoặc xem dữ liệu mẫu.');
  }catch(e){say(e.message,true);}
}
$('stage2-file').addEventListener('change',()=>{$('btn-stage2-parse').disabled=!$('stage2-file').files?.length;parsed=null;$('btn-stage2-import').disabled=true;});
$('btn-stage2-refresh').addEventListener('click',()=>refresh().then(()=>say('Đã làm mới.')).catch(e=>say(e.message,true)));
$('btn-stage2-parse').addEventListener('click',async()=>{
  const file=$('stage2-file').files?.[0]; if(!file)return;
  $('btn-stage2-parse').disabled=true;$('btn-stage2-import').disabled=true;parsed=null;
  try{
    parsed=await parseExcelFile(file,{onProgress:progress});
    $('parsed-questions').textContent=String(parsed.summary.validQuestions);
    $('parsed-students').textContent=String(parsed.summary.validStudents);
    $('parsed-la').textContent=String(parsed.summary.skippedLA);
    $('parsed-invalid').textContent=String(parsed.summary.invalidRows);
    const rows=Object.entries(parsed.summary.byGrade).sort((a,b)=>Number(a[0])-Number(b[0]));
    fillTable('stage2-graded-stats',rows,'Chưa có câu hỏi hợp lệ.',([grade,x])=>[grade,x.c1,x.c2,x.c3]);
    fillTable('stage2-issues',parsed.issues.slice(0,100),'Không phát hiện lỗi.',x=>[x.sheet,x.row,x.message]);
    $('btn-stage2-import').disabled=!(parsed.questions.length||parsed.students.length);
    say(`Phân tích xong: ${parsed.questions.length} câu hợp lệ, ${parsed.students.length} học sinh. ${parsed.summary.invalidRows} dòng không hợp lệ. Chưa lưu vào dữ liệu.`);
  }catch(e){say(e.message,true);}finally{$('btn-stage2-parse').disabled=false;}
});
$('btn-stage2-import').addEventListener('click',async()=>{
  if(!parsed||!db)return;
  if(!confirm(`Đồng ý lưu ${parsed.questions.length} câu hỏi và ${parsed.students.length} học sinh vào ${db.mode.toUpperCase()}?`))return;
  $('btn-stage2-import').disabled=true;
  try{
    const result=await importWorkbookData(db,parsed,{onProgress:progress});
    say(`Đã lưu ${result.questions} câu hỏi và ${result.students} học sinh (${result.batches} lô).`);
    await refresh();
  }catch(e){say(e.message,true);}finally{$('btn-stage2-import').disabled=false;}
});
$('stage2-teacher-login').addEventListener('submit',async e=>{
  e.preventDefault();
  try{await db.signInTeacher($('stage2-email').value,$('stage2-password').value);$('stage2-password').value='';await refresh();say('Đã đăng nhập quyền giáo viên.');}
  catch(err){say(err.message,true);}
});
$('btn-stage2-logout').addEventListener('click',async()=>{
  try{await db.signOut();await refresh();say('Đã đăng xuất.');}catch(e){say(e.message,true);}
});
$('btn-stage2-reset').addEventListener('click',async()=>{
  if(!db||db.mode!=='demo'||!confirm('Xóa dữ liệu Demo đã nhập và khôi phục dữ liệu mẫu?'))return;
  try{await db.signInTeacher();await db.resetDemo();await refresh();say('Đã khôi phục dữ liệu mẫu.');}catch(e){say(e.message,true);}
});
init();
