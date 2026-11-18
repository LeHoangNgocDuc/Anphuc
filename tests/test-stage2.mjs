import assert from 'node:assert/strict';
import {APP_CONFIG, resolveAppMode, normalizePhone, phoneToE164} from '../js/config.js';
import {createDatabase, LocalDemoAdapter, importWorkbookData} from '../js/db.js';
import {parseExcelMatrices, normalizeGrade, normalizeLevel, normalizeHeader, makeLessonKey} from '../js/excel-parser.js';

const makeRows=()=>({name:'QuestionBank',rows:[
  ['ID question','Type','Level','Grade','Subject','Chapter','Topic','Question','Option 1','Option 2','Option 3','Option 4','Correct answer','Explain'],
  ['T1','MC','Nhận biết','7A','Toán','Chương 1','Bài 1','2+2=?','3','4','5','6','B','4'],
  ['T2','TF','Thông hiểu',7,'Toán','Chương 1','Bài 1','Bốn ý','2=2','2=3','1=1','0=1','ĐSĐS','DSDS'],
  ['T3','SA','Vận dụng cao',7,'Toán','Chương 1','Bài 1','15-5?','','','','','10','10'],
  ['T4','LA','Vận dụng',7,'Toán','Chương 1','Bài 1','Tự luận','','','','','abc','bỏ qua'],
  ['T5','MC','Vận dụng cao',7,'Toán','Chương 1','Bài 1','9×2=?','18','15','12','10','A','18'],
  ['T6','MC','Nhận biết',7,'Toán','Chương 1','Bài 1','Thiếu phương án','18','','12','10','A','invalid'],
]});
const studentSheet={name:'Student_List',rows:[
  ['StudentID','FullName','Class','Phone'],
  [1001,'Lê Đức An','7A','84325256302'],
  ['1002','Hà Bích Ngọc','6A','357055794'],
  ['1003','Không Lớp','',123],
]};
assert.equal(resolveAppMode(APP_CONFIG),'demo');
assert.equal(normalizePhone('84325256302'),'0325256302');
assert.equal(phoneToE164('0357055794'),'+84357055794');
assert.equal(normalizeHeader('Đáp án đúng'),'dapandung');
assert.equal(normalizeGrade('Lớp 10A26'),10);
assert.equal(normalizeLevel('Vận dụng cao'),'Vận dụng cao');
assert.equal(makeLessonKey(7,' Chương 1 ',' Bài 1 '),'g7|chương 1|bài 1');
assert.throws(()=>resolveAppMode({...APP_CONFIG,supabase:{url:'',key:'sb_secret_XXX'}}),/Thiếu/);
assert.throws(()=>resolveAppMode({...APP_CONFIG,supabase:{url:'https://abc.supabase.co',key:'sb_secret_XXX'}}),/service-role/);
const parsed=await parseExcelMatrices([makeRows(),studentSheet]);
assert.equal(parsed.summary.validQuestions,4);
assert.equal(parsed.summary.validStudents,2);
assert.equal(parsed.summary.skippedLA,1);
assert.equal(parsed.summary.invalidRows,2);
assert.deepEqual(parsed.summary.byGrade['7'],{c1:1,c2:1,c3:2});
assert.equal(parsed.students[0].parent_phone,'0325256302');
assert.equal(parsed.students[1].grade,6);
assert.equal(parsed.questions.find(x=>x.question_id==='T2').correct_answer,'DSDS');

class MemoryStorage {
  constructor(){this.map=new Map();}
  async init(){return this;}
  async getAll(table){return structuredClone(this.map.get(table)??[]);}
  async putMany(table,rows){
    const key={students:'student_code',questions:'question_id',app_settings:'key',lesson_visibility:'id',lesson_progress:'id',attendance_tuition:'id'}[table];
    const map=new Map((this.map.get(table)??[]).map(x=>[x[key],x]));
    for(const row of rows)map.set(row[key],structuredClone(row));
    this.map.set(table,[...map.values()]);
  }
  async clear(){this.map.clear();}
}
const db=await createDatabase({storage:new MemoryStorage()});
assert.equal(db.mode,'demo');
const initial=await db.getStudents();
assert.equal(initial.length,3);
let sample=await db.getLessonCatalog(7);
assert.equal(sample.length,1);
const prompts=await db.getLessonQuestions(7,sample[0].lesson_key);
assert.ok(prompts.length>=5);
assert.ok(prompts.every(q=>!('correct_answer' in q)&&!('explanation' in q)));
const imported=await importWorkbookData(db,parsed,{batchSize:1});
assert.deepEqual({questions:imported.questions,students:imported.students},{questions:4,students:2});
assert.equal((await db.getStudents()).length,5);
assert.equal((await db.getTeacherQuestions({grade:7})).length,10);
await db.signOut();
assert.equal((await db.getSession()).role,'guest');
await assert.rejects(()=>db.upsertQuestions(parsed.questions),/giáo viên/);
await db.requestPhoneOtp('0900000001');
await db.verifyPhoneOtp('0900000001','123456');
const siblings=await db.getStudents();
assert.equal(siblings.length,2);
await assert.rejects(()=>db.getProgress('demo-student-002'),/Không có quyền/);
await assert.rejects(()=>db.getUnpaidTuition({month:11,year:2026}),/giáo viên/);
await db.signInTeacher();
const unpaid=await db.getUnpaidTuition({month:11,year:2026});
assert.equal(unpaid.rows.length,5); // fallback to configured DEMO fee
assert.equal(unpaid.warnings.length,0);
assert.ok(unpaid.rows.every(x=>x.fee_status==='unpaid'&&x.paid_amount===0));

// Large import, 6300 question rows, yields every 300 to avoid long tasks.
const bigSheet={name:'ToanTHCS',rows:[makeRows().rows[0]]};
for(let i=0;i<6300;i++) bigSheet.rows.push([`L${i}`,'MC','Nhận biết',6,'Toán','Chương 1','Bài 1',`Câu ${i}?`,'1','2','3','4','B','2']);
let progressCalls=0;
const large=await parseExcelMatrices([bigSheet],{onProgress:()=>progressCalls++});
assert.equal(large.summary.validQuestions,6300);
assert.ok(progressCalls>=21);
let importCalls=0;
const imp=await importWorkbookData(db,large,{onProgress:()=>importCalls++});
assert.equal(imp.questions,6300);
assert.equal(imp.batches,21);
assert.ok(importCalls>=22);
assert.equal((await db.getTeacherQuestions({grade:6})).length,6303);
console.log('PASS: config, telephone, schema mapping, 3 levels, LA exclusion, duplicate/error validation, Demo access, unpaid binary status, 6300-row chunk import.');
