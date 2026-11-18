import assert from 'node:assert/strict';
import { APP_CONFIG, normalizePhone } from '../js/config.js';
import { LocalDemoAdapter, SupabaseAdapter } from '../js/db.js';
import { LEVELS, levelOf, getLevelCounts, isLevelUnlocked, levelsFromCatalog,
  prepareAttempt, answerMatches, gradeDemoAttempt, advanceProgress, lessonMetrics } from '../js/lms-engine.js';

assert.equal(normalizePhone('84325256302'),'0325256302');
assert.equal(LEVELS.length,3);
const q=[
  {question_id:'m1',question_type:'MC',level:'Nhận biết',correct_answer:'B',option_1:'4',option_2:'5',option_3:'6',option_4:'7'},
  {question_id:'m2',question_type:'MC',level:'Vận dụng',correct_answer:'C',option_1:'1',option_2:'2',option_3:'3',option_4:'4'},
  {question_id:'t',question_type:'TF',level:'Thông hiểu',correct_answer:'DDSS'},
  {question_id:'s',question_type:'SA',level:'Vận dụng cao',correct_answer:'0.5'},
  {question_id:'m3',question_type:'MC',level:'Vận dụng cao',correct_answer:'A'},
];
assert.deepEqual(q.map(levelOf),[1,2,2,3,3]);
const counts=getLevelCounts(q);
assert.deepEqual(counts,{1:1,2:2,3:2});
assert.equal(isLevelUnlocked(1,counts,{}),true);
assert.equal(isLevelUnlocked(2,counts,{}),false);
assert.equal(isLevelUnlocked(3,counts,{}),false);
const opened=advanceProgress(null,counts,1,6,{student_id:'a',grade:7,lesson_key:'lesson'});
assert.equal(opened.best_overall,2);
assert.equal(opened.first_overall,2);
assert.equal(isLevelUnlocked(2,counts,opened),true);
const second=advanceProgress(opened,counts,2,7.5);
assert.equal(second.best_overall,4.5);
assert.equal(isLevelUnlocked(3,counts,second),true);
const final=advanceProgress(second,counts,3,9);
assert.equal(final.best_overall,7.5);
assert.equal(final.is_completed,true);
const repeated=advanceProgress(final,counts,1,1);
assert.equal(repeated.best_c1,6);
assert.equal(repeated.first_overall,2);
assert.equal(repeated.attempts_count,4);
const no1={1:0,2:1,3:1};
assert.equal(isLevelUnlocked(2,no1,{}),true);
assert.equal(isLevelUnlocked(3,no1,{}),false);
assert.equal(isLevelUnlocked(3,no1,{best_c2:6}),true);
assert.equal(isLevelUnlocked(3,{1:0,2:0,3:1},{}),true);
assert.equal(isLevelUnlocked(3,{1:1,2:0,3:1},{best_c1:4.99}),false);
assert.equal(isLevelUnlocked(3,{1:1,2:0,3:1},{best_c1:5}),true);
assert.equal(answerMatches({question_type:'SA',correct_answer:'0.5'},'0,50000001').correct,true);
assert.equal(answerMatches({question_type:'SA',correct_answer:'0.5'},'0,51').correct,false);
assert.equal(answerMatches({question_type:'TF',correct_answer:'DDSS'},'DSDS').fraction,.5);
const score=gradeDemoAttempt(q,2,{m2:'C',t:'DSDS'});
assert.equal(score.score,7.5);
assert.equal(score.breakdown.length,2);
await assert.rejects(async()=>gradeDemoAttempt(q,2,{m2:'C'}),/đủ số câu/);
const prepared=prepareAttempt(q,1,()=>.5);
assert.ok(prepared.every(x=>!('correct_answer' in x)));
assert.deepEqual(prepared[0].displayOptions.map(x=>x.key).sort(),['A','B','C','D']);
const totals=lessonMetrics([{lesson_key:'lesson',chapter:'A',topic:'B',c1_count:1,c2_count:2,c3_count:2}], [repeated]);
assert.equal(totals.completed,1);
assert.equal(totals.stars,3);

const demo=await new LocalDemoAdapter(APP_CONFIG).init();
await demo.signOut();
await assert.rejects(()=>demo.submitLessonAttempt({studentId:'demo-student-001'}),/xác thực/);
await demo.requestPhoneOtp('0900000001');
await demo.verifyPhoneOtp('0900000001','123456');
const siblings=await demo.getStudents();
assert.equal(siblings.length,2);
const st=siblings.find(x=>x.grade===7);
assert.ok(st);
await assert.rejects(()=>demo.submitLessonAttempt({studentId:'demo-student-002',grade:7,lessonKey:'bad',level:1,answers:{},requestId:'attempt0001'}),/quyền/);
const catalog=await demo.getLessonCatalog(7);
assert.equal(catalog.length,1);
const lesson=catalog[0];
assert.equal(lesson.c1_count,2);
const raw=await demo.getLessonQuestions(7,lesson.lesson_key);
assert.ok(raw.every(x=>!('correct_answer' in x)&&!('explanation' in x)));
assert.equal((await demo.getClassSchedules({grade:7,className:'7A'})).length,2);
await assert.rejects(()=>demo.submitLessonAttempt({studentId:st.id,grade:7,lessonKey:lesson.lesson_key,level:2,answers:{},requestId:'attempt0002'}),/khóa/);
const c1=await demo.submitLessonAttempt({studentId:st.id,grade:7,lessonKey:lesson.lesson_key,level:1,
  answers:{'DEMO-Q01':'B','DEMO-Q02':'C'},requestId:'attempt0003'});
assert.equal(c1.score,10);
assert.equal(c1.progress.first_overall,3.33);
assert.equal(c1.progress.attempts_count,1);
assert.equal(c1.unlocked[2],true);
const same=await demo.submitLessonAttempt({studentId:st.id,grade:7,lessonKey:lesson.lesson_key,level:1,
  answers:{'DEMO-Q01':'A','DEMO-Q02':'A'},requestId:'attempt0003'});
assert.equal(same.score,10);
assert.equal((await demo.getProgress(st.id))[0].attempts_count,1);
const c2=await demo.submitLessonAttempt({studentId:st.id,grade:7,lessonKey:lesson.lesson_key,level:2,
  answers:{'DEMO-Q03':'DSDS','DEMO-Q04':'B'},requestId:'attempt0004'});
assert.equal(c2.score,10);
const c3=await demo.submitLessonAttempt({studentId:st.id,grade:7,lessonKey:lesson.lesson_key,level:3,
  answers:{'DEMO-Q05':'5','DEMO-Q06':'B'},requestId:'attempt0005'});
assert.equal(c3.score,10);
assert.equal(c3.progress.best_overall,10);
assert.equal(c3.completed,true);
assert.equal(c3.progress.first_overall,3.33);
assert.equal(c3.progress.attempts_count,3);
const parentMonths=await demo.getAttendanceTuition({studentId:st.id});
assert.ok(Array.isArray(parentMonths));

// Browser-side SupabaseAdapter must delegate final grade to SQL RPC. No local
// correct_answer, no direct lesson_progress INSERT/UPDATE.
let captured=null;
const fakeClient={rpc:async(name,args)=>{captured={name,args};return {data:{score:7.5,progress:{best_overall:7.5}},error:null};}};
const live=new SupabaseAdapter(fakeClient);
const serverScore=await live.submitLessonAttempt({studentId:st.id,grade:7,lessonKey:'g7|a|b',level:1,answers:{m1:'B'},requestId:'11111111-1111-4111-8111-111111111111'});
assert.equal(captured.name,'submit_lesson_attempt');
assert.equal(captured.args.p_answers.m1,'B');
assert.equal(serverScore.score,7.5);
console.log('PASS Stage3: lesson mapping, shuffle, MC/TF/SA, unlock with missing levels, first/best score, demo OTP/RBAC, sibling access, idempotent submissions, server-only score RPC.');
