/** An Phuc LMS Stage 4 - Teacher administration portal. */
import {normalizePhone,moneyVN,dateVN} from '../config.js';
import {importWorkbookData} from '../db.js';
import {parseExcelFile} from '../excel-parser.js';
import {elt,replace,status,showModal} from './ui-utils.js';
import {monthlyTuitionRows,dashboardReport,paginateNotices,validatePrintRows} from '../teacher-reports.js';

const $=id=>document.getElementById(id);
const v=id=>$(id)?.value??'';
const cell=value=>elt('td',{text:String(value??'')});
const rowsOrEmpty=(target,items,empty,colspan)=>{
  if(items.length)replace(target,...items);
  else replace(target,elt('tr',{},elt('td',{text:empty,colspan})));
};
const todayInVN=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLine=()=>{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date());
  const find=k=>parts.find(x=>x.type===k)?.value||'';
  return `Nha Trang, ngày ${find('day')} tháng ${find('month')} năm ${find('year')}`;
};
const safeText=(raw)=>String(raw??'').trim();
function fillSelect(select,values,{empty='',label=String,keep=true}={}){
  const old=select.value;
  replace(select,elt('option',{value:'',text:empty}),...values.map(x=>elt('option',{value:String(x),text:label(x)})));
  if(keep&&[...select.options].some(o=>o.value===old))select.value=old;
}
function paymentMonths(){
  const now=todayInVN();const [year,month]=now.split('-').map(Number);
  replace($('tuition-month'),...Array.from({length:12},(_,i)=>elt('option',{value:String(i+1),text:`Tháng ${i+1}`})));
  replace($('tuition-year'),...Array.from({length:7},(_,i)=>elt('option',{value:String(year-3+i),text:String(year-3+i)})));
  $('tuition-month').value=String(month);$('tuition-year').value=String(year);
}
function uiError(node,error,prefix='Lỗi'){
  console.error(prefix,error);
  status(node,`${prefix}: ${error?.message||error}`,'error');
}
function reportCsv(report){
  const csvCell=s=>{
    const value=String(s??'').replace(/^[\s\uFEFF]*[=+@\-]/,'\u0027$&');
    return `"${value.replace(/"/g,'""')}"`;
  };
  const lines=[['Mã HS','Học sinh','Lớp','Điểm kỷ lục TB','Bài hoàn thành','Lượt luyện'],
    ...report.ranked.map(x=>[x.student.student_code,x.student.full_name,x.student.class_name,x.score,x.completed,x.attempts])];
  return '\ufeff'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
function downloadCsv(content,filename){
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function mountTeacherPortal({db,onAuthChange=()=>{}}){
  const state={authorized:false,students:[],questions:[],progress:[],records:[],visibility:[],settings:{},
    parsed:null,notices:[],checked:new Set(),report:null,paymentTarget:null,busy:false,loaded:false};
  const gate=$('teacher-protected'), authState=$('teacher-auth-state'), authPanel=$('teacher-auth-panel');
  const busy=async(callback,node)=>{
    if(state.busy)return;
    state.busy=true;if(node)node.disabled=true;
    try{return await callback();}finally{state.busy=false;if(node)node.disabled=false;}
  };
  async function activate(){
    try{
      const session=await db.getSession();
      const authorized=['teacher','admin'].includes(session.role);
      state.authorized=authorized;
      gate.hidden=!authorized;gate.inert=!authorized;
      $('teacher-login-open').hidden=authorized;
      $('teacher-logout').hidden=!authorized;
      status(authState,authorized?`Đã xác thực (${session.role}) · ${db.mode==='demo'?'Dữ liệu DEMO':'Supabase Auth'}`:
        'Bạn chưa đăng nhập quyền giáo viên.',authorized?'success':'info');
      $('teacher-auth-help').textContent=db.mode==='demo'
        ?'Chế độ Demo: nhấn Đăng nhập giáo viên để thử các chức năng với dữ liệu giả định. Không nhập dữ liệu thật.'
        :'Chỉ tài khoản đã có vai trò teacher/admin trong bảng staff_roles mới được thao tác.';
      if(authorized&&!state.loaded)await refresh();
      if(!authorized)state.loaded=false;
    }catch(err){uiError(authState,err,'Xác thực');}
  }
  function guard(){if(!state.authorized)throw new Error('Cần đăng nhập quyền giáo viên.');}
  async function refresh(){
    guard();status($('teacher-global-status'),'Đang đồng bộ dữ liệu…');
    try{
      const [students,questions,progress,records,visibility,settings]=await Promise.all([
        db.getStudents({active:false}),db.getTeacherQuestions(),db.getAllProgress(),db.getAttendanceTuition(),db.getLessonVisibility(),db.getSettings(),
      ]);
      state.students=students;state.questions=questions;state.progress=progress;state.records=records;
      state.visibility=visibility;state.settings=settings;
      $('teacher-default-fee').value=Number(settings.tuition_default_amount||0)||'';
      initFilters();renderQuestions();renderStudents();renderPayments();renderReport();invalidateNotices();
      state.loaded=true;status($('teacher-global-status'),`Đã tải ${students.length} học sinh, ${questions.length} câu hỏi.`,'success');
    }catch(err){uiError($('teacher-global-status'),err,'Không thể tải dữ liệu giáo viên');}
  }
  function activeStudents(){return state.students.filter(s=>s.active!==false);}
  function classes(){return [...new Set(activeStudents().map(s=>s.class_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));}
  function initFilters(){
    fillSelect($('teacher-class-filter'),classes(),{empty:'Tất cả lớp'});
    const grades=[...new Set(activeStudents().map(s=>s.grade))].sort((a,b)=>a-b);
    fillSelect($('tuition-grade'),grades,{empty:'Tất cả khối',label:g=>`Khối ${g}`});
    fillSelect($('teacher-report-grade'),grades,{empty:'Tất cả khối',label:g=>`Khối ${g}`});
    updateTuitionClassOptions();updateReportClassOptions();
  }
  function updateTuitionClassOptions(){
    const grade=v('tuition-grade');
    const matched=activeStudents().filter(s=>!grade||Number(s.grade)===Number(grade));
    const names=[...new Set(matched.map(s=>s.class_name))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    fillSelect($('tuition-class'),names,{empty:'Tất cả lớp'});
  }
  function updateReportClassOptions(){
    const grade=v('teacher-report-grade');
    const names=[...new Set(activeStudents().filter(s=>!grade||Number(s.grade)===Number(grade)).map(s=>s.class_name))]
      .sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
    fillSelect($('teacher-report-class'),names,{empty:'Tất cả lớp'});
  }
  function filteredStudents(){return activeStudents().filter(s=>!v('teacher-class-filter')||s.class_name===v('teacher-class-filter'));}
  function attendanceMap(){
    return new Map(state.records.filter(x=>x.record_type==='attendance'&&x.class_date===v('teacher-attendance-date')).map(x=>[x.student_id,x]));
  }
  function renderStudents(){
    const rows=filteredStudents(),att=attendanceMap(),body=[];
    for(const student of rows){
      const tr=elt('tr');
      tr.append(cell(student.student_code),cell(student.full_name),cell(student.class_name),cell(student.parent_phone||'—'));
      const control=elt('select',{class:'select teacher-table-select','aria-label':`Điểm danh ${student.full_name}`});
      [['','Chưa ghi'],['present','Có mặt'],['absent','Vắng'],['excused','Có phép']].forEach(([value,text])=>control.append(elt('option',{value,text})));
      control.value=att.get(student.id)?.attendance_status||'';
      const save=elt('button',{type:'button',class:'btn btn-soft btn-small',text:'Lưu'});
      save.addEventListener('click',()=>busy(async()=>{
        if(!control.value){status($('teacher-students-status'),'Hãy chọn trạng thái điểm danh.','error');return;}
        try{
          const row=await db.saveAttendance({studentId:student.id,date:v('teacher-attendance-date'),attendanceStatus:control.value});
          const idx=state.records.findIndex(x=>x.record_type==='attendance'&&x.student_id===student.id&&x.class_date===row.class_date);
          if(idx>=0)state.records[idx]=row;else state.records.push(row);
          status($('teacher-students-status'),`Đã lưu điểm danh ${student.full_name} ngày ${v('teacher-attendance-date')}.`,'success');renderReport();
        }catch(e){uiError($('teacher-students-status'),e,'Lưu điểm danh');}
      },save));
      tr.append(elt('td',{},elt('div',{class:'action-inline'},control,save)));
      const edit=elt('button',{type:'button',class:'btn btn-outline btn-small',text:'Sửa'});
      edit.addEventListener('click',()=>editStudent(student));tr.append(elt('td',{},edit));body.push(tr);
    }
    rowsOrEmpty($('teacher-student-rows'),body,'Không có học sinh phù hợp.',6);
  }
  function editStudent(student=null){
    $('teacher-student-form').reset();
    $('teacher-student-dialog-title').textContent=student?'Sửa hồ sơ học sinh':'Thêm học sinh';
    fillSelect($('edit-student-grade'),[6,7,8,9,10,11,12],{empty:'Chọn khối',keep:false});
    $('edit-student-code').value=student?.student_code||'';$('edit-student-code').readOnly=!!student;
    $('edit-student-name').value=student?.full_name||'';
    $('edit-student-grade').value=student?.grade||'';
    $('edit-student-class').value=student?.class_name||'';
    $('edit-student-phone').value=student?.parent_phone||'';
    $('edit-student-fee').value=student?.custom_fee??'';
    $('edit-student-note').value=student?.note||'';
    $('edit-student-active').checked=student?.active!==false;
    status($('edit-student-status'),'');showModal($('teacher-student-dialog'));
  }
  $('teacher-student-form').addEventListener('submit',event=>{
    event.preventDefault();const button=$('edit-student-save');
    busy(async()=>{
      try{
        const row=await db.saveStudent({student_code:v('edit-student-code'),full_name:v('edit-student-name'),
          grade:v('edit-student-grade'),class_name:v('edit-student-class'),parent_phone:v('edit-student-phone'),
          custom_fee:v('edit-student-fee'),note:v('edit-student-note'),active:$('edit-student-active').checked});
        const index=state.students.findIndex(x=>x.student_code===row.student_code);
        if(index>=0)state.students[index]=row;else state.students.push(row);
        $('teacher-student-dialog').close();initFilters();renderStudents();renderPayments();renderReport();invalidateNotices();
        status($('teacher-students-status'),`Đã lưu hồ sơ ${row.full_name}.`,'success');
      }catch(err){uiError($('edit-student-status'),err,'Lưu học sinh');}
    },button);
  });

  function renderQuestions(){
    const count={1:0,2:0,3:0},groups=new Map();
    const visibility=new Map(state.visibility.map(x=>[`${x.grade}|${x.lesson_key}`,x.is_published!==false]));
    for(const q of state.questions){
      if(q.is_active===false)continue;
      const level=q.question_type==='TF'||(q.question_type==='MC'&&q.level==='Vận dụng')?2:
        (q.question_type==='SA'||(q.question_type==='MC'&&q.level==='Vận dụng cao')?3:1);
      count[level]++;
      const key=`${q.grade}|${q.lesson_key}`;
      if(!groups.has(key))groups.set(key,{grade:q.grade,chapter:q.chapter,topic:q.topic,lesson_key:q.lesson_key,counts:{1:0,2:0,3:0}});
      groups.get(key).counts[level]++;
    }
    $('teacher-question-stats').querySelectorAll('.metric-value').forEach((node,i)=>node.textContent=String(count[i+1]));
    const ordered=[...groups.values()].sort((a,b)=>Number(a.grade)-Number(b.grade)||a.chapter.localeCompare(b.chapter,'vi')||a.topic.localeCompare(b.topic,'vi'));
    rowsOrEmpty($('teacher-lesson-catalog'),ordered.map(g=>{
      const key=`${g.grade}|${g.lesson_key}`;
      const published=visibility.get(key)!==false;
      const toggle=elt('button',{type:'button',class:'btn btn-small '+(published?'btn-outline':'btn-soft'),text:published?'Đang hiện':'Đang ẩn'});
      toggle.addEventListener('click',()=>busy(async()=>{
        try{await db.setLessonPublished(g.grade,g.lesson_key,!published);
          const idx=state.visibility.findIndex(x=>`${x.grade}|${x.lesson_key}`===key);
          if(idx>=0)state.visibility[idx].is_published=!published;else state.visibility.push({grade:g.grade,lesson_key:g.lesson_key,is_published:!published});
          renderQuestions();
        }catch(err){uiError($('excel-progress-label'),err,'Cập nhật hiển thị');}
      },toggle));
      return elt('tr',{},cell(g.grade),cell(`${g.chapter} · ${g.topic}`),cell(g.counts[1]),cell(g.counts[2]),cell(g.counts[3]),elt('td',{},toggle));
    }),'Chưa nhập câu hỏi.',6);
  }
  function filters(){return {month:Number(v('tuition-month')),year:Number(v('tuition-year')),grade:v('tuition-grade'),className:v('tuition-class')};}
  function monthlyRows(){return monthlyTuitionRows(state.students,state.records,{...filters(),defaultFee:state.settings.tuition_default_amount});}
  function renderPayments(){
    let rows;
    try{rows=monthlyRows();}catch{return;}
    rowsOrEmpty($('teacher-payment-rows'),rows.map(s=>{
      const paid=s.fee_status==='paid';const action=elt('button',{type:'button',class:'btn btn-small '+(paid?'btn-outline':'btn-soft'),text:paid?'Hoàn tác':'Đánh dấu đã đóng',disabled:!s.fee_known});
      action.addEventListener('click',()=>{
        if(paid){
          if(!window.confirm(`Chuyển học phí ${s.full_name} tháng ${filters().month}/${filters().year} về CHƯA ĐÓNG?`))return;
          busy(async()=>{try{await db.saveTuition({studentId:s.id,month:filters().month,year:filters().year,paid:false});await refreshPaymentsOnly();}
            catch(err){uiError($('teacher-payment-status'),err,'Hoàn tác học phí');}},action);
        }else{
          state.paymentTarget=s;$('teacher-payment-summary').textContent=`${s.full_name} · ${s.class_name} · ${filters().month}/${filters().year} · ${moneyVN(s.fee_due)}`;
          $('teacher-payment-form').reset();status($('teacher-payment-dialog-status'),'');showModal($('teacher-payment-dialog'));
        }
      });
      return elt('tr',{},cell(s.full_name),cell(s.class_name),cell(s.fee_known?moneyVN(s.fee_due):'Chưa rõ'),
        cell(paid?'Đã đóng':'Chưa đóng'),elt('td',{},action));
    }),'Không có học sinh theo bộ lọc.',5);
    const paid=rows.filter(x=>x.fee_status==='paid').length;
    const due=rows.filter(x=>x.fee_status==='unpaid'&&x.fee_known).length;
    const unknown=rows.filter(x=>!x.fee_known).length;
    status($('teacher-payment-status'),`${rows.length} học sinh · ${paid} đã đóng · ${due} chưa đóng${unknown?` · ${unknown} chưa biết mức phí`:''}`,'info');
  }
  async function refreshPaymentsOnly(){
    state.records=await db.getAttendanceTuition();renderPayments();renderReport();invalidateNotices();
    status($('teacher-payment-status'),'Đã cập nhật học phí và đồng bộ danh sách.','success');
  }
  $('teacher-payment-form').addEventListener('submit',e=>{
    e.preventDefault();const target=state.paymentTarget;if(!target)return;
    busy(async()=>{
      try{await db.saveTuition({studentId:target.id,month:filters().month,year:filters().year,paid:true,
        method:v('teacher-payment-method'),reference:v('teacher-payment-reference')});
        $('teacher-payment-dialog').close();await refreshPaymentsOnly();}
      catch(err){uiError($('teacher-payment-dialog-status'),err,'Xác nhận học phí');}
    },$('teacher-payment-confirm'));
  });
  $('teacher-save-default-fee').addEventListener('click',()=>busy(async()=>{
    try{const fee=Number(v('teacher-default-fee'));
      if(!Number.isInteger(fee)||fee<=0)throw new Error('Nhập học phí mặc định lớn hơn 0 đồng.');
      await db.saveSetting('tuition_default_amount',fee);state.settings.tuition_default_amount=fee;
      renderPayments();renderReport();invalidateNotices();status($('teacher-payment-status'),`Đã lưu mức phí mặc định ${moneyVN(fee)}.`,'success');
    }catch(err){uiError($('teacher-payment-status'),err,'Lưu mức học phí');}
  },$('teacher-save-default-fee')));

  function invalidateNotices(){state.notices=[];state.checked.clear();replace($('tuition-unpaid-rows'),elt('tr',{},elt('td',{colspan:6,text:'Hãy nhấn “Lấy danh sách chưa đóng”.'})));
    $('tuition-check-all').checked=false;$('btn-preview-notices').disabled=true;
    $('print-root').replaceChildren();status($('tuition-notice-status'),'');}
  function renderUnpaid(){
    const all=state.notices;
    rowsOrEmpty($('tuition-unpaid-rows'),all.map(student=>{
      const checked=state.checked.has(student.id);
      const control=elt('input',{type:'checkbox',checked,'aria-label':`Chọn ${student.full_name}`});
      control.addEventListener('change',()=>{if(control.checked)state.checked.add(student.id);else state.checked.delete(student.id);updateSelection();});
      return elt('tr',{},elt('td',{},control),cell(student.student_code),cell(student.full_name),cell(student.class_name),
        cell(moneyVN(student.fee_due)),cell('Chưa đóng'));
    }),'Không có học sinh chưa đóng học phí trong tháng đã chọn.',6);
    updateSelection();
  }
  function updateSelection(){
    $('btn-preview-notices').disabled=!state.checked.size;
    $('tuition-check-all').checked=!!state.notices.length&&state.checked.size===state.notices.length;
    $('tuition-check-all').indeterminate=state.checked.size>0&&state.checked.size<state.notices.length;
    status($('tuition-notice-status'),`Đã chọn ${state.checked.size}/${state.notices.length} giấy thông báo.`, 'info');
  }
  async function fetchUnpaid(){
    try{const result=await db.getUnpaidTuition(filters());
      state.notices=validatePrintRows(result.rows||[]);state.checked=new Set(state.notices.map(x=>x.id));
      renderUnpaid();if(result.warnings?.length){status($('tuition-notice-status'),
        `${state.notices.length} phiếu đủ dữ liệu. ${result.warnings.length} cảnh báo: ${result.warnings.slice(0,2).join(' | ')}`,'error');}
    }catch(err){invalidateNotices();uiError($('tuition-notice-status'),err,'Không tải được danh sách');}
  }
  $('tuition-check-all').addEventListener('change',e=>{state.checked=new Set(e.target.checked?state.notices.map(x=>x.id):[]);renderUnpaid();});
  function buildNotice(student){
    const notice=$('tuition-notice-template').content.firstElementChild.cloneNode(true);
    if(document.querySelector('input[name="tuition-display-mode"]:checked')?.value==='short')notice.classList.add('fee-notice--short');
    const data={month:filters().month,year:filters().year,student_name:student.full_name,class_name:student.class_name,
      tuition_period:`${filters().month}/${filters().year}`,fee_due:moneyVN(student.fee_due),fee_paid:moneyVN(0),
      fee_remaining:moneyVN(student.fee_due),date_line:dateLine(),message:safeText(v('tuition-notice-message'))};
    notice.querySelectorAll('[data-fill]').forEach(el=>{el.textContent=data[el.dataset.fill]??'';});
    return notice;
  }
  function createSheets(){
    const paper=document.querySelector('input[name="tuition-paper"]:checked')?.value||'a4';
    const chosen=validatePrintRows(state.notices.filter(x=>state.checked.has(x.id)));
    if(!chosen.length)throw new Error('Chưa chọn học sinh cần in.');
    const pages=paginateNotices(chosen,paper);
    return {pages:pages.map(group=>{
      const sheet=elt('section',{class:`print-sheet print-sheet--${paper}`});
      group.forEach(student=>sheet.append(buildNotice(student)));
      if(paper==='a4')sheet.append(elt('div',{class:'a4-cut-line','aria-hidden':'true'}));
      return sheet;
    }),paper,students:chosen.length};
  }
  function previewNotices(){
    try{
      const {pages,paper,students}=createSheets();
      replace($('print-root'),...pages.map(x=>x.cloneNode(true)));
      const screen=pages.map(x=>{const node=x.cloneNode(true);node.classList.add('preview-sheet');return node;});
      replace($('print-preview-content'),elt('p',{class:'note',text:`${students} học sinh · ${pages.length} trang ${paper.toUpperCase()}. Chọn “Lưu PDF” trong hộp thoại in của trình duyệt.`}),...screen);
      $('btn-export-pdf').disabled=false;$('btn-print-notices').disabled=false;showModal($('print-preview-dialog'));
    }catch(err){uiError($('tuition-notice-status'),err,'Không thể xem trước');}
  }
  function printNotices(){
    if(!$('print-root').children.length)return;
    // Native browser printing preserves editable, sharp vector typography.
    window.print();
  }
  $('btn-preview-notices').addEventListener('click',previewNotices);
  $('btn-print-notices').addEventListener('click',printNotices);
  $('btn-export-pdf').addEventListener('click',printNotices);

  function renderReport(){
    try{
      const report=dashboardReport(state.students,state.progress,state.records,{...filters(),grade:v('teacher-report-grade'),className:v('teacher-report-class'),defaultFee:state.settings.tuition_default_amount});
      state.report=report;
      const x=report.summary;
      $('teacher-overview-metrics').querySelectorAll('.metric-value').forEach((el,i)=>{
        el.textContent=[x.students,x.unpaid,`${x.average.toFixed(2)}/10`][i];
      });
      const box=$('teacher-report-content');
      const lines=elt('div',{class:'report-summary-grid'},
        ...[['Đang học',x.students],['Đã đóng học phí',x.paid],['Chưa đóng',x.unpaid],['Chưa rõ mức phí',x.unknown],['Tổng cần thu',moneyVN(x.unpaidMoney)],['Số lượt điểm danh',x.attendance]].map(([title,value])=>elt('div',{class:'report-stat'},elt('span',{text:title}),elt('b',{text:String(value)}))));
      const leaderboard=elt('table',{class:'data-table'},elt('thead',{},elt('tr',{},...['Học sinh','Lớp','Điểm TB','Bài hoàn thành','Lượt luyện'].map(t=>elt('th',{text:t})))));
      const leadBody=elt('tbody');report.ranked.slice(0,40).forEach(x=>leadBody.append(elt('tr',{},
        cell(x.student.full_name),cell(x.student.class_name),cell(`${x.score.toFixed(2)}/10`),cell(x.completed),cell(x.attempts))));
      if(!leadBody.children.length)leadBody.append(elt('tr',{},elt('td',{colspan:5,text:'Chưa có tiến độ.'})));
      leaderboard.append(leadBody);
      const warning=elt('p',{class:'note',text:`${report.attention.length} học sinh chưa có lượt luyện tập: ${report.attention.slice(0,10).map(x=>x.student.full_name).join(', ')}${report.attention.length>10?'…':''}`});
      replace(box,lines,elt('h3',{text:'Xếp hạng kỷ lục theo học sinh'}),elt('div',{class:'table-wrap'},leaderboard),
        elt('h3',{text:'Học sinh cần quan tâm'}),warning);
    }catch(err){uiError($('teacher-global-status'),err,'Lập báo cáo');}
  }
  $('teacher-export-csv').addEventListener('click',()=>{
    if(!state.report)return;downloadCsv(reportCsv(state.report),`bao-cao-luyen-tap-${todayInVN()}.csv`);
  });
  function wire(){
    paymentMonths();$('teacher-attendance-date').value=todayInVN();
    $('teacher-login-open').addEventListener('click',()=>{
      if(db.mode==='demo'){
        busy(async()=>{try{await db.signInTeacher();onAuthChange();await activate();}
          catch(err){uiError(authState,err,'Đăng nhập Demo');}},$('teacher-login-open'));
      }else showModal($('teacher-login-dialog'));
    });
    $('teacher-submit').disabled=false;
    $('teacher-login-form').addEventListener('submit',event=>{event.preventDefault();busy(async()=>{
      try{await db.signInTeacher(v('teacher-email'),v('teacher-password'));
        $('teacher-password').value='';$('teacher-login-dialog').close();onAuthChange();await activate();
      }catch(err){uiError($('teacher-login-status'),err,'Đăng nhập giáo viên');}
    },$('teacher-submit'));});
    $('teacher-logout').addEventListener('click',()=>busy(async()=>{
      try{await db.signOut();state.authorized=false;state.students=[];state.questions=[];state.records=[];
        state.progress=[];state.notices=[];state.checked.clear();state.loaded=false;$('print-root').replaceChildren();onAuthChange();await activate();}
      catch(err){uiError(authState,err,'Đăng xuất');}},$('teacher-logout')));
    $('teacher-refresh').addEventListener('click',()=>busy(refresh,$('teacher-refresh')));
    $('teacher-class-filter').addEventListener('change',renderStudents);
    $('teacher-report-grade').addEventListener('change',()=>{updateReportClassOptions();renderReport();});
    $('teacher-report-class').addEventListener('change',renderReport);
    $('teacher-attendance-date').addEventListener('change',renderStudents);
    $('teacher-add-student').addEventListener('click',()=>editStudent());
    $('tuition-grade').addEventListener('change',()=>{updateTuitionClassOptions();renderPayments();renderReport();invalidateNotices();});
    for(const id of ['tuition-month','tuition-year','tuition-class'])$(id).addEventListener('change',()=>{renderPayments();renderReport();invalidateNotices();});
    $('teacher-load-payments').addEventListener('click',()=>busy(refreshPaymentsOnly,$('teacher-load-payments')));
    $('btn-load-unpaid').addEventListener('click',()=>busy(fetchUnpaid,$('btn-load-unpaid')));
    const file=$('excel-import');
    file.addEventListener('change',()=>{state.parsed=null;$('teacher-parse-excel').disabled=!file.files?.length;
      $('teacher-import-excel').disabled=true;});
    $('teacher-parse-excel').addEventListener('click',()=>busy(async()=>{
      const uploaded=file.files?.[0];if(!uploaded)return;
      try{state.parsed=await parseExcelFile(uploaded,{onProgress:prog=>{
        $('excel-progress').value=Number(prog.percent||0);status($('excel-progress-label'),`${prog.phase}: ${prog.percent||0}%`);}});
        const result=state.parsed.summary;
        status($('excel-progress-label'),`Hợp lệ: ${result.validQuestions} câu, ${result.validStudents} học sinh; bỏ ${result.skippedLA} tự luận; ${result.invalidRows} dòng lỗi; ${result.duplicates} trùng. Kiểm tra trước khi nhập.`,'success');
        $('teacher-import-excel').disabled=!(state.parsed.questions.length||state.parsed.students.length);
      }catch(err){uiError($('excel-progress-label'),err,'Phân tích Excel');}
    },$('teacher-parse-excel')));
    $('teacher-import-excel').addEventListener('click',()=>busy(async()=>{
      if(!state.parsed)return;
      if(!confirm(`Lưu ${state.parsed.questions.length} câu và ${state.parsed.students.length} học sinh vào ${db.mode.toUpperCase()}? Dữ liệu trùng mã sẽ được cập nhật.`))return;
      try{const result=await importWorkbookData(db,state.parsed,{onProgress:p=>{
        $('excel-progress').value=Number(p.percent||0);status($('excel-progress-label'),`Đang lưu: ${p.percent||0}%`);}});
        status($('excel-progress-label'),`Đã nhập ${result.questions} câu, ${result.students} học sinh (${result.batches} lô).`,'success');
        await refresh();
      }catch(err){uiError($('excel-progress-label'),err,'Nhập Excel');}
    },$('teacher-import-excel')));
  }
  wire();
  function reset(){
    state.authorized=false;state.loaded=false;
    state.students=[];state.questions=[];state.progress=[];state.records=[];
    state.notices=[];state.checked.clear();
    gate.hidden=true;gate.inert=true;
    $('print-root').replaceChildren();
    $('teacher-login-open').hidden=false;$('teacher-logout').hidden=true;
    status(authState,'Bạn chưa đăng nhập quyền giáo viên.');
  }
  return {activate,refresh,reset,getState:()=>state};
}
