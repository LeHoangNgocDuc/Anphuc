/** Parent portal Stage 3: real OTP, multiple children, progress, attendance & tuition. */
import { normalizePhone } from '../config.js';
import { levelsFromCatalog, lessonMetrics } from '../lms-engine.js';
import { elt, replace, status, formatScore, emptyBlock, moneyVN, dateVN } from './ui-utils.js';
const get=id=>document.getElementById(id);
const weekdays={2:'Thứ Hai',3:'Thứ Ba',4:'Thứ Tư',5:'Thứ Năm',6:'Thứ Sáu',7:'Thứ Bảy',8:'Chủ Nhật'};
function recentMonths(count=12){
  const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).formatToParts(new Date());
  const month=Number(parts.find(p=>p.type==='month').value),year=Number(parts.find(p=>p.type==='year').value);
  return Array.from({length:count},(_,i)=>{const date=new Date(Date.UTC(year,month-1-i,1));return {month:date.getUTCMonth()+1,year:date.getUTCFullYear()};});
}
export function mountParentPortal({db,onAuthChange=()=>{}}){
  const ui={phone:get('parent-phone'),request:get('parent-otp-request'),form:get('parent-login-form'),
    message:get('parent-login-message'),summary:get('parent-summary-metrics'),
    progress:get('parent-progress-list'),attendance:get('parent-attendance-content'),
    tuition:get('parent-tuition-rows')};
  const state={students:[],student:null,catalog:[],progress:[]};
  ui.request.disabled=false;
  ui.request.addEventListener('click',async()=>{
    const phone=normalizePhone(ui.phone.value);
    if(!phone){status(ui.message,'Vui lòng nhập số điện thoại 10 chữ số.','error');return;}
    ui.request.disabled=true;status(ui.message,'Đang yêu cầu mã OTP…');
    try{await db.requestPhoneOtp(phone);
      status(ui.message,db.mode==='demo'?'DEMO: mã xác minh 123456.':'Đã gửi mã OTP. Vui lòng kiểm tra SMS.');
      appendOTP(phone);
    }catch(e){status(ui.message,e.message,'error');}
    finally{ui.request.disabled=false;}
  });
  function appendOTP(phone){
    get('parent-verify-form')?.remove();
    const form=elt('form',{id:'parent-verify-form',class:'stage3-otp-form'});
    const inp=elt('input',{class:'input',type:'text',inputmode:'numeric',autocomplete:'one-time-code',maxlength:'8',required:true,placeholder:'Mã OTP','aria-label':'Mã xác minh'});
    const submit=elt('button',{type:'submit',class:'btn btn-primary',text:'Xác minh'});
    form.append(inp,submit);
    form.addEventListener('submit',async e=>{
      e.preventDefault();submit.disabled=true;
      try{await db.verifyPhoneOtp(phone,inp.value);status(ui.message,'Đã xác minh. Đang tải hồ sơ…','success');
        onAuthChange();await activate(true);
      }catch(error){status(ui.message,error.message,'error');}finally{submit.disabled=false;}
    });
    ui.form.after(form);inp.focus();
  }
  async function activate(force=false){
    const session=await db.getSession();
    if(!['parent','teacher','admin'].includes(session.role))return;
    if(state.student&&!force)return;
    try{
      state.students=await db.getStudents();
      if(!state.students.length){status(ui.message,'Số điện thoại đã xác minh chưa được liên kết với học sinh nào.','error');return;}
      showStudents();await selectStudent(state.students[0]);
    }catch(e){status(ui.message,e.message,'error');}
  }
  function showStudents(){
    let chooser=get('parent-student-choice');
    if(!chooser){
      chooser=elt('div',{id:'parent-student-choice',class:'stage3-parent-choice'});
      ui.message.after(chooser);
    }
    const picker=elt('select',{class:'select','aria-label':'Chọn hồ sơ con'});
    state.students.forEach(student=>picker.append(elt('option',{value:student.id,text:`${student.full_name} · ${student.class_name}`})));
    picker.addEventListener('change',()=>{
      const student=state.students.find(x=>x.id===picker.value);
      if(student)selectStudent(student);
    });
    replace(chooser,elt('label',{class:'field'},elt('strong',{text:state.students.length>1?'Chọn con cần xem':'Hồ sơ học sinh'}),picker));
  }
  async function selectStudent(student){
    state.student=student;status(ui.message,`Đang xem thông tin: ${student.full_name} – ${student.class_name}.`,'success');
    try{
      const [catalog,progress,records,schedules,settings]=await Promise.all([
        db.getLessonCatalog(student.grade),db.getProgress(student.id),
        db.getAttendanceTuition({studentId:student.id}),
        db.getClassSchedules({grade:student.grade,className:student.class_name}),
        db.getSettings({publicOnly:true}),
      ]);
      state.catalog=catalog;state.progress=progress;
      renderProgress(catalog,progress);renderAttendance(records,schedules);renderTuition(student,records,settings);
    }catch(e){status(ui.message,`Không tải được hồ sơ: ${e.message}`,'error');}
  }
  function renderProgress(catalog,progress){
    const result=lessonMetrics(catalog,progress);
    const stats=[String(result.pending),formatScore(result.average),String(result.attempts)];
    ui.summary.querySelectorAll('.metric-value').forEach((node,i)=>{node.textContent=stats[i]??'0';});
    const lessons=[...result.lessons].sort((a,b)=>Number(a.is_completed)-Number(b.is_completed)||a.chapter.localeCompare(b.chapter,'vi')||a.topic.localeCompare(b.topic,'vi'));
    if(!lessons.length){replace(ui.progress,emptyBlock('Chưa có bài luyện tập nào dành cho khối này.'));return;}
    replace(ui.progress,...lessons.map(l=>{
      const progress=l.progress;
      const card=elt('article',{class:'stage3-parent-lesson'});
      card.append(elt('h3',{text:l.topic}),elt('p',{class:'note',text:l.chapter}));
      const first=progress.first_overall===null||progress.first_overall===undefined?'Chưa làm':`${formatScore(progress.first_overall)}/10`;
      card.append(elt('p',{class:'stage3-parent-scores',text:`Điểm kỷ lục ${formatScore(l.best_overall)}/10 · Lần đầu: ${first} → Cao nhất: ${formatScore(l.best_overall)} · ${Number(progress.attempts_count)||0} lượt` }));
      const badges=elt('div',{class:'stage3-score-badges'});
      for(const k of [1,2,3])if(l.counts[k]){
        badges.append(elt('span',{class:'stage3-score-pill',text:`C${k}: ${formatScore(progress[`best_c${k}`])}`}));
      }
      card.append(badges,elt('p',{class:'note',text:l.is_completed?'Đã hoàn thành tất cả các cấp hiện có.':'Còn cấp độ cần hoàn thành (đạt từ 5.0).'}));
      return card;
    }));
  }
  function renderAttendance(records,schedules){
    const attendance=records.filter(x=>x.record_type==='attendance');
    const present=attendance.filter(x=>x.attendance_status==='present').length;
    const absent=attendance.filter(x=>x.attendance_status==='absent').length;
    const excused=attendance.filter(x=>x.attendance_status==='excused').length;
    const wrap=elt('div',{class:'stage3-attendance-block'});
    wrap.append(elt('p',{text:`Chuyên cần: ${present} có mặt · ${absent} vắng · ${excused} có phép (${attendance.length} buổi ghi nhận).`}));
    const scheduleHeader=elt('h3',{text:'Lịch học theo lớp'});wrap.append(scheduleHeader);
    if(!schedules.length)wrap.append(elt('p',{class:'note',text:'Trung tâm chưa cập nhật lịch học cho lớp này.'}));
    else schedules.forEach(s=>wrap.append(elt('p',{class:'stage3-schedule-row',text:`${weekdays[Number(s.weekday)]||'Thứ '+s.weekday} · ${String(s.start_time).slice(0,5)} · ${s.duration_minutes} phút${s.teacher_name?' · '+s.teacher_name:''}`})));
    if(attendance.length){
      const ordered=[...attendance].sort((a,b)=>String(b.class_date).localeCompare(String(a.class_date))).slice(0,15);
      const table=elt('table',{class:'data-table'});
      const head=elt('thead',{},elt('tr',{},elt('th',{text:'Ngày học'}),elt('th',{text:'Điểm danh'})));
      const body=elt('tbody');
      ordered.forEach(r=>body.append(elt('tr',{},elt('td',{text:dateVN(r.class_date)}),
        elt('td',{text:({present:'Có mặt',absent:'Vắng',excused:'Có phép'})[r.attendance_status]??'Chưa rõ'}))));
      table.append(head,body);wrap.append(elt('div',{class:'table-wrap'},table));
    }
    replace(ui.attendance,wrap);
  }
  function renderTuition(student,records,settings){
    const latest=new Map();
    records.filter(x=>x.record_type==='tuition').forEach(x=>{
      const key=`${x.tuition_year}-${x.tuition_month}`;
      const old=latest.get(key);
      if(!old||String(x.created_at??'')>String(old.created_at??''))latest.set(key,x);
    });
    const enrolledRaw=String(student.enrolled_on??'').slice(0,7);
    const enrolledMatch=/^(\d{4})-(\d{2})$/.exec(enrolledRaw);
    const enrolledKey=enrolledMatch?(Number(enrolledMatch[1])*12+Number(enrolledMatch[2])):null;
    const months=recentMonths().filter(x=>enrolledKey===null || x.year*12+x.month>=enrolledKey);
    const defaultFee=Number(settings.tuition_default_amount??0); // usually private, may be unavailable
    replace(ui.tuition,...months.map(({month,year})=>{
      const r=latest.get(`${year}-${month}`);
      const fee=Number(r?.fee_due ?? student.custom_fee ?? defaultFee);
      const paid=r?.fee_status==='paid';
      const value=Number.isFinite(fee)&&fee>0?moneyVN(fee):'Liên hệ trung tâm';
      const known=Number.isFinite(fee)&&fee>0;
      return elt('tr',{},elt('td',{text:`Tháng ${month}/${year}`}),elt('td',{text:value}),
        elt('td',{},elt('span',{class:paid?'stage3-paid':'stage3-unpaid',
          text:!known&&!paid?'Chưa có mức phí':(paid?'Đã đóng':'Chưa đóng')})));
    }));
  }
  function reset(){
    state.students=[];state.student=null;state.catalog=[];state.progress=[];
    get('parent-student-choice')?.remove();
    ui.summary.querySelectorAll('.metric-value').forEach(x=>x.textContent='--');
    ui.progress.textContent='Vui lòng xác thực số điện thoại để xem tiến độ.';
    ui.attendance.textContent='Chưa có thông tin để hiển thị.';
    ui.tuition.replaceChildren(elt('tr',{},elt('td',{colspan:3,text:'Vui lòng xác thực để xem học phí.'})));
    ui.message.textContent='Vui lòng xác thực số điện thoại.';
  }
  return {activate,selectStudent,reset,getState:()=>state};
}
