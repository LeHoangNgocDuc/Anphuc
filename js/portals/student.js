/** Student portal Stage 3: OTP, siblings, 3-level practice, server-graded results. */
import { normalizePhone } from '../config.js';
import { LEVELS, prepareAttempt, isLevelUnlocked, levelsFromCatalog, lessonMetrics } from '../lms-engine.js';
import { elt, replace, status, formatScore, addRichText, emptyBlock, showModal } from './ui-utils.js';

const LNAME={1:'Nền tảng',2:'Thông thạo',3:'Chinh phục'};
const get=id=>document.getElementById(id);
function newUuid(){
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
  // Stage 3 requires a secure context (HTTPS) for live Supabase/OTP.
  throw new Error('Cần mở web bằng HTTPS để gửi bài an toàn.');
}

export function mountStudentPortal({db,onAuthChange=()=>{}}){
  const ui={
    phone:get('student-phone'),request:get('student-otp-request'),message:get('student-login-message'),
    metrics:get('student-metrics'),chapter:get('student-chapter'),grid:get('student-lesson-grid'),
    achievements:get('student-achievements-content'),loginForm:get('student-login-form'),
    quiz:get('quiz-dialog'),quizItems:get('quiz-questions'),quizSubmit:get('quiz-submit'),quizStatus:get('quiz-status'),
    quizLevel:get('quiz-level-label'),result:get('quiz-result-dialog'),resultScore:get('result-score'),
    resultBreakdown:get('result-breakdown'),unlock:get('result-unlock-message'),
    explanation:get('explanation-dialog'),explanationItems:get('explanation-content'),explanationButton:get('result-view-explanation'),
    popover:get('student-choice-popover'),popOptions:get('student-choice-options'),
  };
  const state={student:null,students:[],catalog:[],progress:[],activeAttempt:null,lastResult:null,filter:'pending'};
  ui.request.disabled=false;
  ui.message.textContent='Nhập số điện thoại để nhận mã OTP. Demo: mã 123456.';
  ui.request.addEventListener('click', async()=>{
    const phone=normalizePhone(ui.phone.value);
    if(!phone){status(ui.message,'Số điện thoại cần đủ 10 chữ số, bắt đầu bằng 0.','error');return;}
    ui.request.disabled=true;status(ui.message,'Đang yêu cầu mã xác minh…');
    try{
      await db.requestPhoneOtp(phone);
      status(ui.message,db.mode==='demo'?'Đã sẵn sàng mã Demo: 123456.':'Mã OTP đã được gửi qua nhà cung cấp SMS.');
      ensureOTP(phone);
    }catch(e){status(ui.message,e.message,'error');}
    finally{ui.request.disabled=false;}
  });
  function ensureOTP(phone){
    let form=get('student-verify-form');
    if(form)form.remove();
    form=elt('form',{id:'student-verify-form',class:'stage3-otp-form'});
    const input=elt('input',{class:'input',type:'text',inputmode:'numeric',autocomplete:'one-time-code',maxlength:'8',placeholder:'Nhập mã OTP',required:true,'aria-label':'Mã OTP'});
    const submit=elt('button',{class:'btn btn-primary',type:'submit',text:'Xác minh'});
    form.append(input,submit);
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();submit.disabled=true;
      try{
        await db.verifyPhoneOtp(phone,input.value);
        status(ui.message,'Xác thực thành công. Đang tải danh sách học sinh…','success');
        onAuthChange();await activate(true);
      }catch(e){status(ui.message,e.message,'error');}
      finally{submit.disabled=false;}
    });
    ui.loginForm.after(form);input.focus();
  }

  async function activate(force=false){
    const session=await db.getSession();
    if(!['parent','teacher','admin'].includes(session.role))return;
    if(state.student&&!force)return;
    try{
      if(force){state.student=null;state.catalog=[];state.progress=[];replace(ui.grid,emptyBlock('Vui lòng chọn học sinh để xem các bài luyện tập.'));}
      state.students=await db.getStudents();
      if(!state.students.length){status(ui.message,'Không tìm thấy học sinh gắn với số điện thoại đã xác minh.','error');return;}
      if(state.students.length===1){await selectStudent(state.students[0]);return;}
      showChoices();
    }catch(e){status(ui.message,e.message,'error');}
  }
  function showChoices(){
    replace(ui.popOptions,...state.students.map(s=>{
      const b=elt('button',{type:'button',class:'popover-option',text:`${s.full_name} · ${s.class_name}`});
      b.addEventListener('click',()=>{ui.popover.hidePopover?.();selectStudent(s);});
      return b;
    }));
    if(ui.popover.showPopover)ui.popover.showPopover();
    else status(ui.message,'Có nhiều học sinh: vui lòng chọn ở danh sách phía trên.');
    let switchButton=get('student-switch-child');
    if(!switchButton){
      switchButton=elt('button',{id:'student-switch-child',class:'btn btn-soft',type:'button',text:'Đổi học sinh'});
      switchButton.addEventListener('click',showChoices);
      ui.message.after(switchButton);
    }
  }
  async function selectStudent(student){
    state.student=student;
    status(ui.message,`Đang xem hồ sơ: ${student.full_name} – lớp ${student.class_name}.`,'success');
    await refresh();
  }
  async function refresh(){
    if(!state.student)return;
    try{
      const [catalog,progress]=await Promise.all([
        db.getLessonCatalog(state.student.grade),db.getProgress(state.student.id),
      ]);
      state.catalog=catalog;
      state.progress=progress;
      drawMetrics();drawChapters();drawLessons();drawAchievements();
    }catch(e){status(ui.message,`Không tải được bài luyện tập: ${e.message}`,'error');}
  }
  function drawMetrics(){
    const m=lessonMetrics(state.catalog,state.progress);
    for(const [i,text] of [formatScore(m.average),`${m.completed}/${m.total}`,String(m.stars)].entries()){
      const node=ui.metrics.querySelectorAll('.metric-value')[i];if(node)node.textContent=text;
    }
  }
  function drawChapters(){
    const old=ui.chapter.value;
    const options=[elt('option',{value:'',text:'Tất cả chương'}),...new Set(state.catalog.map(x=>x.chapter))]
      .map(x=>typeof x==='string'?elt('option',{value:x,text:x}):x);
    replace(ui.chapter,...options);
    if([...ui.chapter.options].some(x=>x.value===old))ui.chapter.value=old;
    ui.chapter.disabled=false;
  }
  function drawLessons(){
    const m=lessonMetrics(state.catalog,state.progress);
    let selected=m.lessons.filter(x=>!ui.chapter.value||x.chapter===ui.chapter.value);
    if(state.filter==='pending')selected=selected.filter(x=>!x.is_completed);
    selected.sort((a,b)=>Number(a.is_completed)-Number(b.is_completed)||a.chapter.localeCompare(b.chapter,'vi')||a.topic.localeCompare(b.topic,'vi'));
    if(!selected.length){replace(ui.grid,emptyBlock(state.filter==='pending'?'Các bài hiện có đã hoàn thành hoặc không có bài cần làm.':'Chưa có bài luyện tập phù hợp.'));return;}
    const cards=selected.map(lesson=>{
      const card=elt('article',{class:'lesson-card stage3-lesson-card'});
      card.append(elt('h3',{text:lesson.topic}),elt('p',{class:'note',text:lesson.chapter}));
      const levels=elt('div',{class:'stage3-levels'});
      for(const {id,name} of LEVELS){
        if(!lesson.counts[id])continue;
        const unlocked=isLevelUnlocked(id,lesson.counts,lesson.progress);
        const best=Number(lesson.progress[`best_c${id}`])||0;
        const label=`C${id} · ${name} · ${best.toFixed(2)}đ ${unlocked?'':'🔒'}`;
        const btn=elt('button',{class:'stage3-level-button',type:'button',disabled:!unlocked,text:label,
          'data-locked':String(!unlocked),'aria-label':`${label}. ${lesson.counts[id]} câu hỏi`});
        if(unlocked)btn.addEventListener('click',()=>openQuiz(lesson,id));
        levels.append(btn);
      }
      card.append(levels,elt('p',{class:'note',text:`Kỷ lục ${formatScore(lesson.best_overall)}/10 · ${Number(lesson.progress.attempts_count)||0} lượt luyện ${lesson.is_completed?'· Đã hoàn thành':''}`}));
      return card;
    });
    replace(ui.grid,...cards);
  }
  function drawAchievements(){
    const m=lessonMetrics(state.catalog,state.progress);
    replace(ui.achievements,elt('div',{},
      elt('strong',{text:`${m.attempts} lượt luyện · ${m.stars} sao`} ),
      elt('p',{text:`Hoàn thành ${m.completed}/${m.total} bài. Điểm kỷ lục trung bình ${formatScore(m.average)}/10.`}),
      elt('p',{text:'Mỗi cấp đạt từ 5.00 điểm được tính một sao. Có thể luyện lại để cải thiện kỷ lục.'})
    ));
  }
  ui.chapter.addEventListener('change',drawLessons);
  document.querySelectorAll('input[name="lesson-filter"]').forEach(input=>input.addEventListener('change',()=>{
    state.filter=document.querySelector('input[name="lesson-filter"]:checked')?.value==='all'?'all':'pending';drawLessons();
  }));

  async function openQuiz(lesson,level){
    try{
      const original=await db.getLessonQuestions(lesson.grade,lesson.lesson_key);
      const questions=prepareAttempt(original,level);
      if(!questions.length)throw new Error('Không tìm thấy câu hỏi của cấp độ đã chọn.');
      state.activeAttempt={lesson,level,questions,requestId:newUuid()};
      ui.quizLevel.textContent=`${lesson.topic} · Cấp ${level} (${LNAME[level]}) · ${questions.length} câu · ${formatScore(10/questions.length)} điểm/câu`;
      const forms=questions.map((q,i)=>renderQuestion(q,i));
      replace(ui.quizItems,...forms);
      status(ui.quizStatus,'Trả lời tất cả câu hỏi trước khi nộp bài.');
      ui.quizSubmit.disabled=true;showModal(ui.quiz);
      ui.quizItems.querySelectorAll('input').forEach(input=>input.addEventListener('input',checkAnswered));
    }catch(e){status(ui.message,`Không mở được bài: ${e.message}`,'error');}
  }
  function renderQuestion(q,i){
    const section=elt('section',{class:'stage3-question',dataset:{qid:q.question_id}});
    const title=elt('div',{class:'stage3-question-title'});
    title.append(elt('b',{text:`Câu ${i+1}. `}));addRichText(title,q.question_text);
    section.append(title);
    if(q.image_url){try{
      const url=new URL(q.image_url);
      if(url.protocol==='https:')section.append(elt('figure',{class:'stage3-image'},elt('img',{
        src:url.href,alt:`Hình câu ${i+1}`,loading:'lazy',decoding:'async',referrerpolicy:'no-referrer'})));
    }catch{/* ignore unsafe image */}}
    if(q.question_type==='MC'){
      const opts=elt('div',{class:'option-grid'});
      q.displayOptions.forEach((option,j)=>{
        const input=elt('input',{type:'radio',name:`q${i}`,value:option.key,required:true,'aria-label':`Phương án ${j+1}`});
        const label=elt('label',{class:'option-card'},input,elt('span',{text:`${'ABCD'[j]}. `}));
        addRichText(label.lastChild,option.text);opts.append(label);
      });
      section.append(opts);
    } else if(q.question_type==='TF'){
      const items=elt('div',{class:'stage3-tf-list'});
      for(let j=1;j<=4;j++){
        const row=elt('div',{class:'stage3-tf-row'});
        const statement=elt('div',{class:'stage3-tf-text'});
        statement.append(elt('strong',{text:`${'abcd'[j-1]}) `}));addRichText(statement,q[`option_${j}`]);
        row.append(statement);
        for(const [v,label] of [['D','Đúng'],['S','Sai']]){
          const inp=elt('input',{type:'radio',name:`q${i}-tf${j}`,value:v,required:true});
          row.append(elt('label',{class:'stage3-choice'},inp,label));
        }
        items.append(row);
      }
      section.append(items);
    } else if(q.question_type==='SA'){
      section.append(elt('label',{class:'field'},elt('span',{text:'Nhập kết quả (dấu phẩy hoặc chấm đều được)'}),
        elt('input',{class:'input stage3-sa-input',type:'text',inputmode:'decimal',autocomplete:'off',maxlength:'1024',required:true,placeholder:'Đáp án của em'})));
    }
    return section;
  }
  function collectAnswers(){
    const obj={};if(!state.activeAttempt)return null;
    for(const [i,q] of state.activeAttempt.questions.entries()){
      const section=ui.quizItems.querySelectorAll('.stage3-question')[i];let answer='';
      if(q.question_type==='MC')answer=section.querySelector('input[type=radio]:checked')?.value??'';
      else if(q.question_type==='TF'){
        answer=[1,2,3,4].map(j=>section.querySelector(`input[name="q${i}-tf${j}"]:checked`)?.value??'').join('');
      } else answer=section.querySelector('.stage3-sa-input')?.value.trim()??'';
      if(!answer || (q.question_type==='TF'&&answer.length!==4))return null;
      obj[q.question_id]=answer;
    }
    return obj;
  }
  function checkAnswered(){ui.quizSubmit.disabled=!collectAnswers();}
  ui.quizSubmit.addEventListener('click',async()=>{
    const attempt=state.activeAttempt,answers=collectAnswers();
    if(!attempt||!answers)return;
    ui.quizSubmit.disabled=true;status(ui.quizStatus,'Đang chấm và lưu kết quả…');
    try{
      const result=await db.submitLessonAttempt({studentId:state.student.id,grade:state.student.grade,
        lessonKey:attempt.lesson.lesson_key,level:attempt.level,answers,requestId:attempt.requestId});
      state.lastResult=result;
      showResult(result,attempt);
      ui.quiz.close();showModal(ui.result);
      await refresh();
    }catch(e){status(ui.quizStatus,`Chưa lưu được điểm: ${e.message}`,'error');ui.quizSubmit.disabled=false;}
  });
  function showResult(result,attempt){
    ui.resultScore.textContent=`${formatScore(result.score)}/10`;
    const progress=result.progress??{};
    const next=attempt.level<3?attempt.level+1:null;
    ui.unlock.textContent=progress.is_completed?'Chúc mừng! Em đã hoàn thành tất cả cấp độ của bài này.':
      (next&&result.unlocked?.[next]?`Đã mở khóa Cấp ${next}: ${LNAME[next]}.`:'Em có thể luyện lại để cải thiện điểm kỷ lục.');
    replace(ui.resultBreakdown,elt('p',{class:'note',text:`Điểm kỷ lục bài: ${formatScore(progress.best_overall)}/10 · Tổng lượt luyện: ${Number(progress.attempts_count)||0}.`}),
      ...result.breakdown.map((item,i)=>elt('p',{class:'stage3-result-line',text:`Câu ${i+1}: ${formatScore(item.points)} điểm ${item.is_correct?'✓':'· Cần ôn tập thêm'}`})));
    ui.explanationButton.disabled=false;
  }
  ui.explanationButton.addEventListener('click',()=>{
    if(!state.lastResult)return;
    replace(ui.explanationItems,...state.lastResult.breakdown.map((item,i)=>{
      const section=elt('section',{class:'stage3-explanation'});
      section.append(elt('h3',{text:`Câu ${i+1} · Đáp án: ${item.correct_answer}`}),
        elt('p',{class:'note',text:`Em đã trả lời: ${item.submitted} · Điểm: ${formatScore(item.points)}`}));
      const text=elt('p');addRichText(text,item.explanation||'Chưa có lời giải cho câu này.');section.append(text);
      return section;
    }));
    ui.result.close();showModal(ui.explanation);
  });
  function reset(){
    state.student=null;state.students=[];state.catalog=[];state.progress=[];
    state.activeAttempt=null;state.lastResult=null;
    replace(ui.grid,emptyBlock('Vui lòng xác thực số điện thoại để xem bài luyện tập.'));
    ui.achievements.textContent='';ui.metrics.querySelectorAll('.metric-value').forEach(x=>x.textContent='--');
    ui.chapter.disabled=true;ui.chapter.replaceChildren(elt('option',{value:'',text:'Tất cả chương'}));
    get('student-switch-child')?.remove();ui.popOptions.replaceChildren();
    ui.message.textContent='Vui lòng xác thực số điện thoại.';
  }
  return {activate,refresh,selectStudent,reset,getState:()=>state};
}
