/**
 * AN PHUC EDUCATION - Stage 2 workbook normalizer.
 * Sheets: QuestionBank, ToanTHCS, ToanTHPT, Student_List.
 * Type LA is deliberately EXCLUDED. MC/TF/SA are validated before import.
 * Parsing ZIP is offloaded to a Worker; normalization yields every 300 rows.
 */
import { APP_CONFIG, normalizePhone } from './config.js';

const FIELD_ALIASES = Object.freeze({
  question_id:['ID question','ID','QuestionID','Question Id','Mã câu hỏi','Ma cau hoi'],
  type:['Type','Question Type','Dạng câu hỏi','Loai cau hoi','Loại câu hỏi'],
  level:['Level','Mức độ','Muc do','Difficulty'],
  grade:['Grade','Khối','Khoi','Lớp','Lop','Class'],
  subject:['Subject','Môn','Mon'],
  chapter:['Chapter','Chương','Chuong'],
  topic:['Topic','Lesson','Bài','Bai','Bài học','Bai hoc'],
  question:['Question','Question Text','Nội dung','Noi dung','Câu hỏi','Cau hoi'],
  option_1:['Option 1','Option1','A','Phương án A','Phuong an A'],
  option_2:['Option 2','Option2','B','Phương án B','Phuong an B'],
  option_3:['Option 3','Option3','C','Phương án C','Phuong an C'],
  option_4:['Option 4','Option4','D','Phương án D','Phuong an D'],
  answer:['Correct answer','CorrectAnswer','Answer','Đáp án','Dap an','Đáp án đúng','Dap an dung'],
  explain:['Explain','Explanation','Giải thích','Giai thich','Lời giải','Loi giai'],
  image:['ImageURL','Image URL','Image','Ảnh','Anh','Hình ảnh','Hinh anh'],
  student_id:['StudentID','Student ID','Mã học sinh','Ma hoc sinh','ID'],
  full_name:['FullName','Full Name','Họ và tên','Ho va ten','Name','Tên học sinh','Ten hoc sinh'],
  class_name:['Class','ClassName','Class Name','Lớp','Lop'],
  phone:['Phone','PhoneNumber','Số điện thoại','So dien thoai','SĐT','SDT','ParentPhone'],
});
const FIELD_NORMAL = Object.fromEntries(Object.entries(FIELD_ALIASES).map(([key,names]) => [key,names.map(normalizeHeader)]));

export function normalizeHeader(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('vi-VN').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'');
}
const asText = (value, max=16000) => String(value == null ? '' : value).replace(/\u0000/g,'').trim().slice(0,max);
const flat = (value) => asText(value,2000).replace(/\s+/g,' ').trim();
const flatLower = value => flat(value).toLocaleLowerCase('vi-VN');

export function normalizeGrade(raw) {
  const value=flat(raw).toLocaleUpperCase('vi-VN');
  if(!value)return null;
  const m=value.match(/(?:^|(?:KHỐI|KHOI|LỚP|LOP|TOÁN|TOAN)\s*)(12|11|10|9|8|7|6)(?=\D|$)/);
  return m?Number(m[1]):null;
}
export function normalizeQuestionType(raw) {
  const x=normalizeHeader(raw);
  const map={mc:'MC',multiplechoice:'MC',tracnghiem:'MC',tn:'MC',tf:'TF',truefalse:'TF',dungsai:'TF',ds:'TF',sa:'SA',shortanswer:'SA',traloingan:'SA',la:'LA',longanswer:'LA',tuluan:'LA'};
  return map[x]??'';
}
export function normalizeLevel(raw, questionType='MC') {
  const x=normalizeHeader(raw);
  if(!x && questionType==='TF')return 'Vận dụng';
  if(!x && questionType==='SA')return 'Vận dụng cao';
  if(['nhanbiet','nb','recognition'].includes(x))return 'Nhận biết';
  if(['thonghieu','th','understanding'].includes(x))return 'Thông hiểu';
  if(['vandung','vd','application'].includes(x))return 'Vận dụng';
  if(['vandungcao','vdc','advancedapplication'].includes(x))return 'Vận dụng cao';
  return '';
}
export function makeLessonKey(grade,chapter,topic) {
  const norm=x=>flatLower(x).replace(/\s+/g,' ');
  return `g${grade}|${norm(chapter)}|${norm(topic)}`;
}
function stableHash(text) {
  let h=2166136261;
  for(let i=0;i<text.length;i++) { h^=text.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0).toString(16).padStart(8,'0');
}

function normalizedMCAnswer(raw, options) {
  const v=flat(raw);
  const noMark=normalizeHeader(v);
  if(/^[abcd]$/i.test(v))return v.toUpperCase();
  if(/^[1-4]$/.test(v))return 'ABCD'[Number(v)-1];
  if(/^(?:option|phuongan|dapan)[1-4abcd]$/.test(noMark)) {
    const final=noMark.at(-1);
    return /^[1-4]$/.test(final)?'ABCD'[Number(final)-1]:final.toUpperCase();
  }
  if(/^(?:dapan|answer)[abcd]$/.test(noMark))return noMark.at(-1).toUpperCase();
  const match=options.findIndex(s=>s && flatLower(s)===flatLower(v));
  return match>=0?'ABCD'[match]:'';
}
function normalizedTFAnswer(raw) {
  const value=flat(raw);
  const compact=value.toLocaleUpperCase('vi-VN').replace(/[\s,;|/-]+/g,'').replace(/Đ/g,'D');
  if(/^[DS]{4}$/.test(compact))return compact;
  if(/^[TF]{4}$/.test(compact))return compact.replace(/T/g,'D').replace(/F/g,'S');
  if(/^[01]{4}$/.test(compact))return compact.replace(/1/g,'D').replace(/0/g,'S');
  const tokens=value.split(/[,;|\/]+/g).map(x=>normalizeHeader(x));
  if(tokens.length===4 && tokens.every(x=>['d','s','dung','sai','true','false','t','f','1','0'].includes(x))) {
    return tokens.map(x=>['d','dung','true','t','1'].includes(x)?'D':'S').join('');
  }
  return '';
}

function getColumns(row) {
  const columnHeaders=row.map(normalizeHeader);
  const found={};
  for(const [key,aliases] of Object.entries(FIELD_NORMAL)) {
    found[key]=columnHeaders.findIndex(v=>v && aliases.includes(v));
  }
  return found;
}
function headerMatch(columns,type) {
  return type==='questions' ? columns.question>=0 && columns.type>=0
    : columns.full_name>=0 && columns.class_name>=0;
}
function findHeader(rows, type) {
  for(let i=0;i<Math.min(18,rows.length);i++) {
    const columns=getColumns(Array.isArray(rows[i])?rows[i]:[]);
    if(headerMatch(columns,type))return {index:i,columns};
  }
  return null;
}
function cell(row,columns,key) {
  const index=columns[key];
  return index>=0?row[index]:'';
}
function isBlank(row) { return !row || row.every(x=>!flat(x)); }
function normalizeImageUrl(raw) {
  const s=flat(raw);
  if(!s)return null;
  try {
    const u=new URL(s);
    return /^https?:$/.test(u.protocol)?s:null;
  } catch { return null; }
}

function makeQuestion(row,columns,sheet,rowNumber,reportIssue) {
  const type=normalizeQuestionType(cell(row,columns,'type'));
  if(type==='LA') return {status:'skip-la'};
  if(!type) {
    reportIssue(sheet,rowNumber,'UNKNOWN_TYPE',`Type không hỗ trợ: ${asText(cell(row,columns,'type'),80)}`);
    return null;
  }
  const rawGrade=cell(row,columns,'grade');
  const grade=normalizeGrade(rawGrade);
  const chapter=flat(cell(row,columns,'chapter'));
  const topic=flat(cell(row,columns,'topic'));
  const questionText=asText(cell(row,columns,'question'),20000);
  const level=normalizeLevel(cell(row,columns,'level'),type);
  if(!grade||!chapter||!topic||!questionText||!level) {
    reportIssue(sheet,rowNumber,'MISSING_QUESTION_FIELD',`Thiếu/sai Khối, Chương, Bài, Câu hỏi hoặc Level (${flat(rawGrade)}/${level}).`);
    return null;
  }
  const options=['option_1','option_2','option_3','option_4'].map(key=>asText(cell(row,columns,key),8000));
  if(['MC','TF'].includes(type) && options.some(x=>!x)) {
    reportIssue(sheet,rowNumber,'MISSING_OPTIONS','MC/TF phải có đủ 4 phương án hoặc 4 mệnh đề.');
    return null;
  }
  const rawAnswer=cell(row,columns,'answer');
  let answer='';
  if(type==='MC')answer=normalizedMCAnswer(rawAnswer,options);
  else if(type==='TF')answer=normalizedTFAnswer(rawAnswer);
  else answer=flat(rawAnswer).replace(/,/g,'.');
  if(!answer) {
    reportIssue(sheet,rowNumber,'INVALID_ANSWER',`Đáp án ${type} không hợp lệ; cần kiểm tra lại định dạng.`);
    return null;
  }
  const code=flat(cell(row,columns,'question_id'));
  const lessonKey=makeLessonKey(grade,chapter,topic);
  const fallback=stableHash([grade,chapter,topic,questionText,...options].join('|'));
  const question_id=code||`AUTO-${grade}-${fallback}`;
  if(!code)reportIssue(sheet,rowNumber,'AUTO_ID',`Thiếu ID; sinh mã ổn định ${question_id}.`,'warning');
  const imageRaw=cell(row,columns,'image');
  const image_url=normalizeImageUrl(imageRaw);
  if(flat(imageRaw)&&!image_url)reportIssue(sheet,rowNumber,'INVALID_IMAGE_URL','Link hình ảnh không hợp lệ, bỏ qua ảnh.','warning');
  return {status:'ok', data:{
    question_id,grade,subject:flat(cell(row,columns,'subject'))||'Toán',chapter,topic,lesson_key:lessonKey,
    question_type:type,level,question_text:questionText,
    option_1:options[0]||null,option_2:options[1]||null,option_3:options[2]||null,option_4:options[3]||null,
    correct_answer:answer,explanation:asText(cell(row,columns,'explain'),20000)||null,
    image_url,
  }};
}
function makeStudent(row,columns,sheet,rowNumber,reportIssue) {
  const code=flat(cell(row,columns,'student_id'));
  const full_name=flat(cell(row,columns,'full_name'));
  const class_name=flat(cell(row,columns,'class_name')).toLocaleUpperCase('vi-VN');
  const grade=normalizeGrade(cell(row,columns,'grade'))||normalizeGrade(class_name);
  const rawPhone=cell(row,columns,'phone');
  const parent_phone=normalizePhone(rawPhone);
  if(!code||!full_name||!class_name||!grade) {
    reportIssue(sheet,rowNumber,'MISSING_STUDENT_FIELD','Thiếu StudentID, FullName, Class hoặc không xác định được khối (6-12).');
    return null;
  }
  if(rawPhone && !parent_phone)reportIssue(sheet,rowNumber,'INVALID_PHONE',`SĐT không hợp lệ ở mã ${code}; để trống, phụ huynh chưa thể xác thực.`, 'warning');
  // Missing/invalid phone is omitted to avoid erasing a valid number on upsert.
  const student={student_code:code,full_name,grade,class_name};
  if(parent_phone)student.parent_phone=parent_phone;
  return student;
}

/** Normalize an already-decoded workbook; also makes pure fixture-based tests possible. */
export async function parseExcelMatrices(sheets,{onProgress,signal,batchSize=APP_CONFIG.import.batchSize}={}) {
  if(!Array.isArray(sheets))throw new Error('Dữ liệu Excel phải là danh sách sheet.');
  const size=Math.max(1,Math.min(300,Number(batchSize)||300));
  const questions=[]; const students=[]; const issues=[];
  const summary={seenRows:0,validQuestions:0,validStudents:0,skippedLA:0,invalidRows:0,duplicates:0,byGrade:{}};
  const issue=(sheet,row,code,message,severity='error')=>{
    if(issues.length<500)issues.push({sheet,row,code,message,severity});
    if(severity==='error')summary.invalidRows++;
  };
  const questionIds=new Set(),studentIds=new Set();
  const normalizedSheets=sheets.map(s=>({name:String(s.name||''), rows:Array.isArray(s.rows)?s.rows:[]}));
  const sources=normalizedSheets.filter(x=>['questionbank','toanthpt','toanthcs'].includes(normalizeHeader(x.name)));
  const sourceStudents=normalizedSheets.filter(x=>['studentlist','danhsachhocsinh','students'].includes(normalizeHeader(x.name)));
  if(!sources.length)throw new Error('Không tìm thấy sheet QuestionBank, ToanTHPT hoặc ToanTHCS.');
  const selected=[...sources.map(x=>({...x,kind:'questions'})),...sourceStudents.map(x=>({...x,kind:'students'}))];
  const total=selected.reduce((n,s)=>n+Math.max(0,s.rows.length-1),0)||1;
  let progress=0;
  for(const sheet of selected) {
    const found=findHeader(sheet.rows,sheet.kind);
    if(!found) { issue(sheet.name,1,'MISSING_HEADER',`Không nhận diện được hàng tiêu đề cho ${sheet.kind}.`); continue; }
    const {columns,index}=found;
    for(let start=index+1; start<sheet.rows.length;start+=size) {
      if(signal?.aborted)throw new Error('Đã hủy phân tích Excel.');
      const stop=Math.min(sheet.rows.length,start+size);
      for(let i=start;i<stop;i++) {
        const row=Array.isArray(sheet.rows[i])?sheet.rows[i]:[];
        progress++; if(isBlank(row))continue;
        summary.seenRows++;
        if(sheet.kind==='questions') {
          const item=makeQuestion(row,columns,sheet.name,i+1,issue);
          if(item?.status==='skip-la') { summary.skippedLA++; continue; }
          if(item?.status!=='ok')continue;
          if(questionIds.has(item.data.question_id)) {
            summary.duplicates++;
            issue(sheet.name,i+1,'DUPLICATE_ID',`Mã câu hỏi trùng: ${item.data.question_id}. Giữ bản ghi đầu tiên.`, 'warning');
            continue;
          }
          questionIds.add(item.data.question_id);questions.push(item.data);summary.validQuestions++;
          const label=String(item.data.grade);
          if(!summary.byGrade[label])summary.byGrade[label]={c1:0,c2:0,c3:0};
          const g=summary.byGrade[label];
          if(item.data.question_type==='MC'&&['Nhận biết','Thông hiểu'].includes(item.data.level))g.c1++;
          else if(item.data.question_type==='TF'||(item.data.question_type==='MC'&&item.data.level==='Vận dụng'))g.c2++;
          else if(item.data.question_type==='SA'||(item.data.question_type==='MC'&&item.data.level==='Vận dụng cao'))g.c3++;
        } else {
          const item=makeStudent(row,columns,sheet.name,i+1,issue);
          if(!item)continue;
          if(studentIds.has(item.student_code)) {
            summary.duplicates++;
            issue(sheet.name,i+1,'DUPLICATE_STUDENT',`Mã học sinh trùng: ${item.student_code}. Giữ bản ghi đầu tiên.`, 'warning');
            continue;
          }
          studentIds.add(item.student_code);students.push(item);summary.validStudents++;
        }
      }
      onProgress?.({phase:'normalize',percent:Math.min(100,Math.round(100*progress/total)),processed:progress,total});
      await (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve=>setTimeout(resolve,0)));
    }
  }
  onProgress?.({phase:'normalize',percent:100,processed:progress,total});
  return {questions,students,summary,issues,sourceSheets:selected.map(s=>s.name)};
}

async function readWithWorker(file,{onProgress,signal}={}) {
  const worker=new Worker(new URL('./excel-worker.js',import.meta.url));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const done=(err,result)=>{if(settled)return;settled=true;cleanup();err?reject(err):resolve(result);};
    const abort=()=>done(new Error('Đã hủy đọc Excel.'));
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=e=>done(new Error(`Worker Excel: ${e.message||'không tải được thư viện'}`));
    worker.onmessage=e=>{
      const m=e.data??{};
      if(m.type==='progress')onProgress?.({phase:'read',percent:m.percent,message:m.message});
      if(m.type==='result')done(null,m.sheets);
      if(m.type==='error')done(new Error(m.message||'Không đọc được Excel trong Worker.'));
    };
    file.arrayBuffer().then(buffer=>{
      if(!settled)worker.postMessage({type:'parse',buffer},[buffer]);
    }).catch(err=>done(err));
  });
}
async function readMainThread(file,{onProgress}={}) {
  const library=globalThis.XLSX;
  if(!library?.read)throw new Error('Chưa nạp thư viện SheetJS để mở Excel. Hãy kết nối Internet và tải lại trang.');
  onProgress?.({phase:'read',percent:5,message:'Đọc file Excel bằng trình duyệt...'});
  const buffer=await file.arrayBuffer();
  const book=library.read(buffer,{type:'array',cellDates:false,dense:true});
  const names=book.SheetNames.filter(name=>[
    'questionbank','toanthcs','toanthpt','studentlist','danhsachhocsinh','students'
  ].includes(normalizeHeader(name)));
  const sheets=names.map(name=>({name,rows:library.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:true,blankrows:false})}));
  onProgress?.({phase:'read',percent:100,message:'Đã giải mã workbook.'});
  return sheets;
}

/** Main user entry point: file from input[type=file] or drop event. */
export async function parseExcelFile(file,{onProgress,signal,useWorker=true}={}) {
  if(!file || typeof file.arrayBuffer!=='function')throw new Error('Hãy chọn file Excel hợp lệ.');
  if(!/\.(xlsx|xls)$/i.test(file.name||''))throw new Error('Định dạng hỗ trợ: .xlsx hoặc .xls');
  const max=APP_CONFIG.import.maxFileMB*1024*1024;
  if(file.size>max)throw new Error(`File quá lớn (tối đa ${APP_CONFIG.import.maxFileMB} MB).`);
  let sheets,workerFallback=false;
  if(useWorker && typeof Worker!=='undefined') {
    try { sheets=await readWithWorker(file,{onProgress,signal}); }
    catch(err) {
      if(signal?.aborted)throw err;
      console.warn('An Phuc: Worker fallback',err);
      workerFallback=true;
      onProgress?.({phase:'read',percent:0,message:'Worker không khả dụng; chuyển sang đọc dự phòng.'});
    }
  }
  if(!sheets)sheets=await readMainThread(file,{onProgress});
  const result=await parseExcelMatrices(sheets,{onProgress,signal});
  return {...result,workerFallback};
}
