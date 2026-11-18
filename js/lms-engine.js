/**
 * AN PHUC LMS - Stage 3 pure learning engine.
 * This module is for UI rules and the offline DEMO. In live mode the grade is
 * ALWAYS recomputed inside Supabase RPC submit_lesson_attempt (never trusted
 * from a browser-provided score). Do not import secret answers in live UI.
 */
export const LEVELS = Object.freeze([
  {id:1, name:'Nền tảng', short:'C1'},
  {id:2, name:'Thông thạo', short:'C2'},
  {id:3, name:'Chinh phục', short:'C3'},
]);
const numeric = n => Number(n) || 0;
export const roundScore = x => Math.round((numeric(x) + Number.EPSILON) * 100) / 100;
export const levelOf = question => {
  const type=String(question.question_type ?? '').toUpperCase();
  const level=String(question.level ?? '').trim();
  if(type==='TF' || (type==='MC' && level==='Vận dụng'))return 2;
  if(type==='SA' || (type==='MC' && level==='Vận dụng cao'))return 3;
  if(type==='MC' && ['Nhận biết','Thông hiểu'].includes(level))return 1;
  return 0;
};
export function getLevelCounts(rows=[]) {
  const counts={1:0,2:0,3:0};
  for(const q of rows){ const level=levelOf(q);if(level)counts[level]++; }
  return counts;
}
export function levelsFromCatalog(lesson) {
  return {1:Number(lesson?.c1_count)||0,2:Number(lesson?.c2_count)||0,3:Number(lesson?.c3_count)||0};
}
export const availableLevels = counts => [1,2,3].filter(k=>numeric(counts[k])>0);
export function isLevelUnlocked(level, counts, progress={}) {
  if(!Number.isInteger(level)||level<1||level>3||numeric(counts[level])<1)return false;
  if(level===1)return true;
  if(level===2)return numeric(counts[1])===0 || numeric(progress.best_c1)>=5;
  if(numeric(counts[2])>0)return numeric(progress.best_c2)>=5;
  return numeric(counts[1])===0 || numeric(progress.best_c1)>=5;
}
export const bestOverall = (progress,counts) => {
  const levels=availableLevels(counts);
  if(!levels.length)return 0;
  return roundScore(levels.reduce((sum,k)=>sum+numeric(progress?.[`best_c${k}`]),0)/levels.length);
};
export const isCompleted = (progress,counts) => {
  const levels=availableLevels(counts);
  return levels.length>0 && levels.every(k=>numeric(progress?.[`best_c${k}`])>=5);
};
export function lessonMetrics(catalog=[], progressRows=[]) {
  const map=new Map(progressRows.map(p=>[String(p.lesson_key),p]));
  let total=0,completed=0,attempts=0,stars=0;
  const lessons=catalog.filter(x=>availableLevels(levelsFromCatalog(x)).length).map(lesson=>{
    const p=map.get(String(lesson.lesson_key))??{};
    const counts=levelsFromCatalog(lesson);
    const best=bestOverall(p,counts);
    const done=isCompleted(p,counts);
    total+=best;
    if(done)completed++;
    attempts+=numeric(p.attempts_count);
    stars+=availableLevels(counts).filter(k=>numeric(p[`best_c${k}`])>=5).length;
    return {...lesson, progress:p, counts, best_overall:best, is_completed:done};
  });
  return {lessons, total:lessons.length,completed,pending:lessons.length-completed,
    average:lessons.length?roundScore(total/lessons.length):0,attempts,stars};
}

function shuffle(array, random=Math.random){
  const data=[...array];
  for(let i=data.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[data[i],data[j]]=[data[j],data[i]];}
  return data;
}
export function prepareAttempt(allQuestions, level, random=Math.random) {
  return shuffle(allQuestions.filter(q=>levelOf(q)===level),random).map(q=>{
    const item={...q};
    // Never let answer keys/explanations accidentally travel to the UI.
    delete item.correct_answer;
    delete item.explanation;
    if(item.question_type==='MC') {
      item.displayOptions=shuffle([1,2,3,4].map((n,i)=>({key:'ABCD'[i], text:String(item[`option_${n}`]??'')})),random);
    }
    return item;
  });
}
export function normalizeAnswer(questionType, value) {
  const str=String(value ?? '').trim();
  if(questionType==='MC')return /^[A-D]$/i.test(str)?str.toUpperCase():'';
  if(questionType==='TF') {
    const normalized=str.toUpperCase().replace(/Đ/g,'D');
    return /^[DS]{4}$/.test(normalized)?normalized:'';
  }
  if(questionType==='SA')return str.replace(/,/g,'.').replace(/\s+/g,' ').slice(0,1024);
  return '';
}
export function answerMatches(question, userAnswer) {
  const type=question.question_type;
  const answer=normalizeAnswer(type,userAnswer);
  const correct=normalizeAnswer(type,question.correct_answer);
  if(!answer)return {fraction:0,correct:false};
  if(type==='TF') {
    const n=[0,1,2,3].reduce((sum,i)=>sum+Number(answer[i]===correct[i]),0);
    return {fraction:n/4,correct:n===4};
  }
  if(type==='SA') {
    const numPattern=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
    let same=false;
    if(numPattern.test(answer)&&numPattern.test(correct)){
      const a=Number(answer),b=Number(correct);
      same=Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-6;
    } else same=answer.toLocaleLowerCase('vi-VN')===correct.toLocaleLowerCase('vi-VN');
    return {fraction:Number(same),correct:same};
  }
  return {fraction:Number(answer===correct), correct:answer===correct};
}
export function gradeDemoAttempt(questions, level, answers) {
  if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('Dữ liệu đáp án không hợp lệ.');
  const selected=questions.filter(q=>levelOf(q)===level);
  if(!selected.length)throw new Error('Cấp độ này không có câu hỏi.');
  if(Object.keys(answers).length!==selected.length)throw new Error('Vui lòng trả lời đủ số câu trong cấp độ.');
  const point=10/selected.length;let total=0;
  const breakdown=selected.map((q,i)=>{
    if(!Object.hasOwn(answers,q.question_id))throw new Error('Thiếu câu trả lời trong bài.');
    const submitted=normalizeAnswer(q.question_type,answers[q.question_id]);
    if(!submitted)throw new Error(`Câu ${i+1}: đáp án chưa hợp lệ hoặc chưa hoàn thành.`);
    const match=answerMatches(q,submitted);
    const awarded=point*match.fraction;
    total+=awarded;
    return {question_id:q.question_id,question_text:q.question_text,question_type:q.question_type,
      submitted,correct_answer:q.correct_answer,explanation:q.explanation??'',
      points:roundScore(awarded),is_correct:match.correct};
  });
  return {score:roundScore(total),breakdown};
}
export function advanceProgress(previous,counts,level,score,meta={}){
  if(!isLevelUnlocked(level,counts,previous??{}))throw new Error('Cấp độ đang khóa hoặc không có câu hỏi.');
  const now={...previous};
  for(const k of [1,2,3]){
    now[`has_c${k}`]=numeric(counts[k])>0;
    now[`best_c${k}`]=Math.max(numeric(now[`best_c${k}`]),k===level?roundScore(score):0);
  }
  now.student_id=meta.student_id??now.student_id;
  now.grade=meta.grade??now.grade;
  now.lesson_key=meta.lesson_key??now.lesson_key;
  now.attempts_count=numeric(now.attempts_count)+1;
  now.best_overall=bestOverall(now,counts);
  if(previous?.first_overall===null || previous?.first_overall===undefined)now.first_overall=now.best_overall;
  now.is_completed=isCompleted(now,counts);
  now.last_attempt_at=new Date().toISOString();
  return now;
}
