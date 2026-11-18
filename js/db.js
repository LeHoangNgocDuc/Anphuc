/**
 * AN PHUC EDUCATION - Stage 2 unified data access.
 * - Demo: IndexedDB with synthetic data; localStorage fallback in restricted browsers.
 * - Live: Supabase Auth + RLS + RPC, never uses service_role keys.
 * - Methods return plain records so Stage 3/4 portals need not know backend.
 */
import { APP_CONFIG, resolveAppMode, normalizePhone, phoneToE164 } from './config.js';
import { getLevelCounts, isLevelUnlocked, gradeDemoAttempt, advanceProgress } from './lms-engine.js';

const TABLES = Object.freeze([
  'students', 'questions', 'lesson_progress', 'attendance_tuition',
  'lesson_visibility', 'app_settings', 'class_schedules',
]);
const PRIMARY = Object.freeze({
  students: 'student_code', questions: 'question_id', lesson_progress: 'id',
  attendance_tuition: 'id', lesson_visibility: 'id', app_settings: 'key', class_schedules: 'id',
});
const PAGE_SIZE = 750;
const clone = (value) => typeof structuredClone === 'function'
  ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const batch = (rows, n) => Array.from({length: Math.ceil(rows.length / n)}, (_,i) => rows.slice(i*n, (i+1)*n));
const yieldMain = async () => {
  if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else await new Promise(resolve => setTimeout(resolve, 0));
};
const clean = value => String(value ?? '').trim();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export class DatabaseError extends Error {
  constructor(message, cause) { super(message); this.name = 'DatabaseError'; this.cause = cause; }
}

function checked(result, label) {
  if (result?.error) throw new DatabaseError(`${label}: ${result.error.message}`, result.error);
  return result?.data ?? null;
}

/** IndexedDB persistence - no external libraries. */
class BrowserDemoStorage {
  constructor(config) {
    this.name = config.storage.dbName;
    this.version = config.storage.version;
    this.connection = null;
    this.kind = null;
    this.memory = new Map(TABLES.map(x => [x, []]));
    this.fallbackKey = `${this.name}:state`;
  }
  async init() {
    if (typeof indexedDB !== 'undefined') {
      try {
        this.connection = await new Promise((resolve, reject) => {
          const request = indexedDB.open(this.name, this.version);
          request.onupgradeneeded = () => {
            const database = request.result;
            TABLES.forEach(table => {
              if (!database.objectStoreNames.contains(table)) database.createObjectStore(table, {keyPath: PRIMARY[table]});
            });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('IndexedDB đang được mở bởi tab khác.'));
        });
        this.kind = 'indexeddb';
        return this;
      } catch (e) { console.warn('An Phuc: IndexedDB unavailable, trying localStorage:', e); }
    }
    this.kind = typeof localStorage !== 'undefined' ? 'localstorage' : 'memory';
    if (this.kind === 'localstorage') {
      try {
        const raw = localStorage.getItem(this.fallbackKey);
        if (raw) {
          const value = JSON.parse(raw);
          TABLES.forEach(t => this.memory.set(t, Array.isArray(value[t]) ? value[t] : []));
        }
      } catch (e) { console.warn('An Phuc: localStorage disabled:', e); this.kind = 'memory'; }
    }
    return this;
  }
  async getAll(table) {
    this.validate(table);
    if (this.connection) {
      return new Promise((resolve, reject) => {
        const tx = this.connection.transaction(table, 'readonly');
        const req = tx.objectStore(table).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return clone(this.memory.get(table));
  }
  validate(table) {
    if (!TABLES.includes(table)) throw new DatabaseError(`Bảng dữ liệu Demo không hợp lệ: ${table}`);
  }
  async putMany(table, rows) {
    this.validate(table);
    if (!rows.length) return;
    if (this.connection) {
      await new Promise((resolve, reject) => {
        const tx = this.connection.transaction(table, 'readwrite');
        const objectStore = tx.objectStore(table);
        for (const row of rows) objectStore.put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Giao dịch bị hủy.'));
      });
    } else {
      const key = PRIMARY[table];
      const map = new Map(this.memory.get(table).map(row => [String(row[key]), row]));
      rows.forEach(row => map.set(String(row[key]), clone(row)));
      this.memory.set(table, [...map.values()]);
      this.persistFallback();
    }
  }
  async clear() {
    if (this.connection) {
      for (const table of TABLES) {
        await new Promise((resolve, reject) => {
          const tx = this.connection.transaction(table, 'readwrite');
          tx.objectStore(table).clear();
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
    } else {
      TABLES.forEach(t => this.memory.set(t, []));
      this.persistFallback();
    }
  }
  persistFallback() {
    if (this.kind !== 'localstorage') return;
    const data = Object.fromEntries(TABLES.map(t => [t, this.memory.get(t)]));
    try { localStorage.setItem(this.fallbackKey, JSON.stringify(data)); }
    catch (e) { throw new DatabaseError('Bộ nhớ trình duyệt đã đầy. Hãy dùng Chrome cho chế độ IndexedDB hoặc dùng Supabase.', e); }
  }
}

const demoQuestions = [
  ['DEMO-Q01',7,'Chương 1. Số hữu tỉ','Cộng, trừ số hữu tỉ','MC','Nhận biết','2 + 3 = ?', ['4','5','6','7'], 'B','Cộng hai số tự nhiên: 2 + 3 = 5.'],
  ['DEMO-Q02',7,'Chương 1. Số hữu tỉ','Cộng, trừ số hữu tỉ','MC','Thông hiểu','-3 + 5 = ?', ['-8','-2','2','8'], 'C','Ta có -3 + 5 = 2.'],
  ['DEMO-Q03',7,'Chương 1. Số hữu tỉ','Cộng, trừ số hữu tỉ','TF','Vận dụng','Chọn Đúng hoặc Sai cho mỗi mệnh đề.', ['1 + 1 = 2','2 - 5 = 3','-1 + 2 = 1','3 + 0 = 4'], 'DSDS','Lần lượt: Đúng, Sai, Đúng, Sai.'],
  ['DEMO-Q04',7,'Chương 1. Số hữu tỉ','Cộng, trừ số hữu tỉ','MC','Vận dụng','Một cửa hàng có 7 bút, bán 3 bút. Còn bao nhiêu bút?', ['3','4','10','21'], 'B','7 - 3 = 4.'],
  ['DEMO-Q05',7,'Chương 1. Số hữu tỉ','Cộng, trừ số hữu tỉ','SA','Vận dụng cao','Tính: 12 - 7 = ?', [], '5','12 - 7 = 5.'],
  ['DEMO-Q06',7,'Chương 1. Số hữu tỉ','Cộng, trừ số hữu tỉ','MC','Vận dụng cao','Tìm x biết x + 3 = 9.', ['3','6','9','12'], 'B','x = 9 - 3 = 6.'],
  ['DEMO-Q07',6,'Chương 1. Số tự nhiên','Phép cộng và phép nhân','MC','Nhận biết','6 × 3 = ?', ['9','18','36','63'], 'B','6 × 3 = 18.'],
  ['DEMO-Q08',6,'Chương 1. Số tự nhiên','Phép cộng và phép nhân','TF','Thông hiểu','Chọn Đúng/Sai.', ['3 + 2 = 5','2 × 2 = 5','6 : 3 = 2','5 - 1 = 1'], 'DSDS','Các ý a, c đúng; b, d sai.'],
  ['DEMO-Q09',6,'Chương 1. Số tự nhiên','Phép cộng và phép nhân','SA','Vận dụng cao','Tính 9 × 8.', [], '72','9 × 8 = 72.'],
];
function demoQuestion(tuple) {
  const [question_id,grade,chapter,topic,question_type,level,question_text,opts,correct_answer,explanation] = tuple;
  return { question_id,grade,subject:'Toán',chapter,topic,
    lesson_key:`g${grade}|${chapter.toLocaleLowerCase('vi-VN')}|${topic.toLocaleLowerCase('vi-VN')}`,
    question_type,level,question_text,
    option_1:opts[0] ?? null, option_2:opts[1] ?? null, option_3:opts[2] ?? null, option_4:opts[3] ?? null,
    correct_answer,explanation,image_url:null,is_active:true };
}
function seedDemoData() {
  return {
    students: [
      {id:'demo-student-001',student_code:'DEMO-001',full_name:'Nguyễn Minh An (mẫu)',grade:7,class_name:'7A',parent_phone:'0900000001',custom_fee:500000,active:true},
      {id:'demo-student-002',student_code:'DEMO-002',full_name:'Trần Hà My (mẫu)',grade:7,class_name:'7A',parent_phone:'0900000002',custom_fee:500000,active:true},
      {id:'demo-student-003',student_code:'DEMO-003',full_name:'Phạm Gia Huy (mẫu)',grade:6,class_name:'6A',parent_phone:'0900000001',custom_fee:450000,active:true},
    ],
    questions: demoQuestions.map(demoQuestion),
    class_schedules: [
      {id:'demo-schedule-7a-2',grade:7,class_name:'7A',weekday:2,start_time:'17:30',duration_minutes:90,teacher_name:'Giáo viên Toán',is_active:true},
      {id:'demo-schedule-7a-5',grade:7,class_name:'7A',weekday:5,start_time:'17:30',duration_minutes:90,teacher_name:'Giáo viên Toán',is_active:true},
      {id:'demo-schedule-6a-3',grade:6,class_name:'6A',weekday:3,start_time:'17:30',duration_minutes:90,teacher_name:'Giáo viên Toán',is_active:true},
    ],
    app_settings: [
      {key:'center_name', value:'Trung tâm Toán An Phúc',is_public:true},
      {key:'center_slogan',value:'Vững kiến thức. Chắc tương lai.',is_public:true},
      {key:'tuition_default_amount',value:500000,is_public:false},
    ],
  };
}

/**
 * LocalDemoAdapter - intentionally not authentication or real payment security.
 * Never use demo for live student/parent personal data.
 */
export class LocalDemoAdapter {
  constructor(config = APP_CONFIG, storage = null) {
    this.mode = 'demo';
    this.storage = storage ?? new BrowserDemoStorage(config);
    this.identity = {id:'demo-admin',role:'admin',demo:true};
    this.config = config;
    this.attemptReceipts = new Map();
    this.demoLoginFailures = new Map();
  }
  async init() {
    await this.storage.init();
    const exists = await this.storage.getAll('students');
    if (!exists.length) {
      const fixture = seedDemoData();
      for (const [table, rows] of Object.entries(fixture)) await this.storage.putMany(table, rows);
    }
    return this;
  }
  async getSession() { return {user:this.identity,role:this.identity.role,mode:'demo'}; }
  async signInTeacher() { this.identity={id:'demo-admin',role:'admin',demo:true}; return this.getSession(); }
  async requestPhoneOtp(phone) {
    phoneToE164(phone);
    return {demo:true,notice:'DEMO: dùng mã 123456. Không gửi SMS thật.',demo_code:'123456'};
  }
  async verifyPhoneOtp(phone, code) {
    const normalized = normalizePhone(phone);
    if (!normalized || String(code).trim() !== '123456') throw new DatabaseError('Mã OTP Demo không hợp lệ (dùng 123456).');
    this.identity = {id:`demo-phone-${normalized}`,role:'parent',phone:normalized,demo:true};
    return this.getSession();
  }
  // The name/phone flow is intentionally DEMO ONLY. Do not expose real student
  // data through a public lookup without verified server-side authentication.
  async searchDemoStudents(query) {
    const normalize = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u0111/gi,'d').toLocaleLowerCase('vi-VN').trim();
    const term=normalize(query);
    if (term.length<2) return [];
    return (await this.list('students')).filter(x=>x.active!==false&&normalize(x.full_name).includes(term))
      .slice(0,10).map(({id,full_name,class_name,grade})=>({id,full_name,class_name,grade}));
  }
  async signInDemoByStudentPhone({studentId,phone}={}) {
    const normalized=normalizePhone(phone);
    const key=String(studentId || '').trim();
    if(!key||!normalized)throw new DatabaseError('Vui l\u00f2ng ch\u1ecdn h\u1ecdc sinh v\u00e0 nh\u1eadp s\u1ed1 \u0111i\u1ec7n tho\u1ea1i h\u1ee3p l\u1ec7.');
    const now=Date.now();
    const attempts=this.demoLoginFailures.get(key)||{count:0,until:0};
    if(attempts.until>now)throw new DatabaseError('\u0110\u00e3 nh\u1eadp sai nhi\u1ec1u l\u1ea7n. Vui l\u00f2ng th\u1eed l\u1ea1i sau 2 ph\u00fat.');
    const student=(await this.list('students')).find(x=>String(x.id)===key&&x.active!==false);
    if(!student||normalizePhone(student.parent_phone)!==normalized) {
      attempts.count++;
      attempts.until=attempts.count>=5?now+120000:0;
      this.demoLoginFailures.set(key,attempts);
      throw new DatabaseError('Th\u00f4ng tin h\u1ecdc sinh v\u00e0 s\u1ed1 \u0111i\u1ec7n tho\u1ea1i kh\u00f4ng kh\u1edbp. Vui l\u00f2ng ki\u1ec3m tra l\u1ea1i.');
    }
    this.demoLoginFailures.delete(key);
    this.identity={id:`demo-parent-${key}`,role:'parent',phone:normalized,studentId:key,demo:true};
    return this.getSession();
  }
  async signOut() { this.identity={id:'demo-guest',role:'guest',demo:true}; return {signedOut:true}; }
  async list(table) { return this.storage.getAll(table); }
  async getStudents({grade,className,phone,active} = {}) {
    let rows = await this.list('students');
    if (this.identity.role === 'parent') rows=rows.filter(x=>x.parent_phone===this.identity.phone && (!this.identity.studentId || x.id===this.identity.studentId));
    if (grade !== undefined && grade !== '') rows=rows.filter(x=>Number(x.grade)===Number(grade));
    if (className) rows=rows.filter(x=>x.class_name===className);
    if (phone) rows=rows.filter(x=>x.parent_phone===normalizePhone(phone));
    if (active !== false) rows=rows.filter(x=>x.active!==false);
    return rows.sort((a,b)=>Number(a.grade)-Number(b.grade)||a.class_name.localeCompare(b.class_name,'vi')||a.full_name.localeCompare(b.full_name,'vi'));
  }
  async getSettings({publicOnly=false}={}) {
    return (await this.list('app_settings')).filter(x=>!publicOnly||x.is_public).reduce((out,x)=>(out[x.key]=x.value,out),{});
  }
  async getLessonCatalog(grade) {
    const questions=(await this.list('questions')).filter(q=>q.is_active!==false && Number(q.grade)===Number(grade));
    const visibility = await this.list('lesson_visibility');
    const hidden = new Set(visibility.filter(x=>!x.is_published).map(x=>`${x.grade}|${x.lesson_key}`));
    const map=new Map();
    for(const q of questions) {
      if(this.identity.role!=='admin' && hidden.has(`${q.grade}|${q.lesson_key}`)) continue;
      if(!map.has(q.lesson_key)) map.set(q.lesson_key,{grade:q.grade,chapter:q.chapter,topic:q.topic,lesson_key:q.lesson_key,c1_count:0,c2_count:0,c3_count:0});
      const item=map.get(q.lesson_key);
      if(q.question_type==='MC'&&['Nhận biết','Thông hiểu'].includes(q.level)) item.c1_count++;
      else if(q.question_type==='TF'||(q.question_type==='MC'&&q.level==='Vận dụng')) item.c2_count++;
      else if(q.question_type==='SA'||(q.question_type==='MC'&&q.level==='Vận dụng cao')) item.c3_count++;
    }
    return [...map.values()].sort((a,b)=>a.chapter.localeCompare(b.chapter,'vi')||a.topic.localeCompare(b.topic,'vi'));
  }
  async getLessonQuestions(grade, lessonKey) {
    if(this.identity.role==='parent') {
      const students=await this.getStudents({grade});
      if(!students.length) throw new DatabaseError('Không có quyền truy cập khối lớp này.');
    }
    const questions=(await this.list('questions')).filter(q=>q.is_active!==false&&Number(q.grade)===Number(grade)&&q.lesson_key===lessonKey);
    const {role}=this.identity;
    if(!['admin','teacher'].includes(role)) {
      const visibility=await this.list('lesson_visibility');
      if(visibility.some(x=>Number(x.grade)===Number(grade)&&x.lesson_key===lessonKey&&x.is_published===false)) return [];
    }
    return questions.map(({correct_answer,explanation, ...visible})=>visible);
  }
  async getTeacherQuestions(filters={}) {
    if(!['admin','teacher'].includes(this.identity.role)) throw new DatabaseError('Chỉ giáo viên có quyền xem đáp án.');
    return (await this.list('questions')).filter(x=>(!filters.grade||Number(x.grade)===Number(filters.grade))&&(!filters.lessonKey||x.lesson_key===filters.lessonKey));
  }
  async getProgress(studentId) { await this.assertStudentAccess(studentId); return (await this.list('lesson_progress')).filter(x=>x.student_id===studentId); }
  async submitLessonAttempt({studentId,grade,lessonKey,level,answers,requestId}={}) {
    const role=this.identity.role;
    if(!['admin','teacher','parent'].includes(role)) throw new DatabaseError('Vui lòng xác thực số điện thoại trước khi luyện tập.');
    const students=await this.getStudents();
    const student=students.find(s=>s.id===studentId);
    if(!student||Number(student.grade)!==Number(grade))throw new DatabaseError('Không có quyền luyện tập cho học sinh này.');
    if(!requestId || !/^[a-zA-Z0-9_-]{8,100}$/.test(String(requestId)))throw new DatabaseError('Mã lượt luyện không hợp lệ.');
    const dedupeKey=`${studentId}:${requestId}`;
    if(this.attemptReceipts.has(dedupeKey))return clone(this.attemptReceipts.get(dedupeKey));
    const available=await this.getLessonQuestions(grade,lessonKey);
    if(!available.length)throw new DatabaseError('Bài chưa được công bố hoặc không có câu hỏi.');
    const raw=(await this.list('questions')).filter(q=>q.is_active!==false && Number(q.grade)===Number(grade) && q.lesson_key===lessonKey);
    const progress=(await this.getProgress(studentId)).find(x=>x.lesson_key===lessonKey)||null;
    const counts=getLevelCounts(raw);
    if(!isLevelUnlocked(Number(level),counts,progress||{}))throw new DatabaseError('Cấp độ chưa được mở khóa.');
    const gradeResult=gradeDemoAttempt(raw,Number(level),answers);
    const updated=advanceProgress(progress,counts,Number(level),gradeResult.score,{student_id:studentId,grade:Number(grade),lesson_key:lessonKey});
    updated.id=progress?.id??makeId();
    await this.storage.putMany('lesson_progress',[updated]);
    const output={...gradeResult,progress:updated,counts,completed:updated.is_completed,
      unlocked:{1:isLevelUnlocked(1,counts,updated),2:isLevelUnlocked(2,counts,updated),3:isLevelUnlocked(3,counts,updated)}};
    this.attemptReceipts.set(dedupeKey,clone(output));
    return output;
  }

  async getClassSchedules({grade,className}={}) {
    if(!['teacher','admin','parent'].includes(this.identity.role))throw new DatabaseError('Vui lòng xác thực trước khi xem lịch.');
    let rows=await this.list('class_schedules');
    if(this.identity.role==='parent'){
      const students=await this.getStudents();
      rows=rows.filter(x=>students.some(s=>Number(s.grade)===Number(x.grade)&&s.class_name===x.class_name));
    }
    if(grade)rows=rows.filter(x=>Number(x.grade)===Number(grade));
    if(className)rows=rows.filter(x=>x.class_name===className);
    return rows.filter(x=>x.is_active!==false).sort((a,b)=>Number(a.weekday)-Number(b.weekday));
  }
  async getAttendanceTuition({studentId,recordType,year,month}={}) {
    if(studentId)await this.assertStudentAccess(studentId);
    let rows=await this.list('attendance_tuition');
    if(this.identity.role==='parent'){
      const students=await this.getStudents(); const ids=new Set(students.map(s=>s.id)); rows=rows.filter(x=>ids.has(x.student_id));
    }
    if(studentId)rows=rows.filter(x=>x.student_id===studentId);
    if(recordType)rows=rows.filter(x=>x.record_type===recordType);
    if(year)rows=rows.filter(x=>Number(x.tuition_year)===Number(year));
    if(month)rows=rows.filter(x=>Number(x.tuition_month)===Number(month));
    return rows;
  }
  assertTeacher() { if(!['teacher','admin'].includes(this.identity.role))throw new DatabaseError('Cần đăng nhập giáo viên.'); }
  async assertStudentAccess(studentId) {
    if(this.identity.role!=='parent')return;
    const allowed=await this.getStudents();
    if(!allowed.some(x=>x.id===studentId))throw new DatabaseError('Không có quyền xem hồ sơ học sinh này.');
  }
  async upsertQuestions(rows) { this.assertTeacher(); await this.storage.putMany('questions', rows); return rows.length; }
  async upsertStudents(rows) {
    this.assertTeacher();
    const old=new Map((await this.list('students')).map(x=>[x.student_code,x]));
    const normalized=rows.map(row=>({...old.get(row.student_code),...row,id:old.get(row.student_code)?.id??makeId(),active:true}));
    await this.storage.putMany('students',normalized); return rows.length;
  }
  async setLessonPublished(grade, lessonKey, published) {
    this.assertTeacher();
    await this.storage.putMany('lesson_visibility',[{id:`${grade}|${lessonKey}`,grade:Number(grade),lesson_key:lessonKey,is_published:!!published}]);
  }
  async getUnpaidTuition(params) { this.assertTeacher(); return collectUnpaid(this,params); }

  async getAllProgress() { this.assertTeacher(); return this.list('lesson_progress'); }
  async getLessonVisibility() { this.assertTeacher(); return this.list('lesson_visibility'); }
  async saveStudent(row) {
    this.assertTeacher();
    const code=clean(row.student_code), name=clean(row.full_name), cls=clean(row.class_name).toUpperCase();
    const grade=Number(row.grade); const phone=row.parent_phone?normalizePhone(row.parent_phone):null;
    if(!code||name.length<2||!cls||!Number.isInteger(grade)||grade<6||grade>12)throw new DatabaseError('Mã, họ tên, khối và lớp học sinh không hợp lệ.');
    if(row.parent_phone && !phone)throw new DatabaseError('Số điện thoại phụ huynh phải gồm 10 chữ số.');
    const fee=row.custom_fee===''||row.custom_fee==null?null:Number(row.custom_fee);
    if(fee!==null && (!Number.isFinite(fee)||fee<0))throw new DatabaseError('Học phí riêng không hợp lệ.');
    const old=(await this.list('students')).find(x=>x.student_code===code);
    const record={...old,...row,id:old?.id||makeId(),student_code:code,full_name:name,grade,class_name:cls,parent_phone:phone,custom_fee:fee,active:row.active!==false};
    await this.storage.putMany('students',[record]);return record;
  }
  async saveSetting(key,value){this.assertTeacher();if(!['tuition_default_amount'].includes(key))throw new DatabaseError('Cài đặt không được hỗ trợ.');await this.storage.putMany('app_settings',[{key,value,is_public:true}]);return true;}
  async saveAttendance({studentId,date,attendanceStatus,note=''}) {
    this.assertTeacher();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !['present','absent','excused'].includes(attendanceStatus))throw new DatabaseError('Ngày hoặc trạng thái điểm danh không hợp lệ.');
    if(!(await this.getStudents()).some(x=>x.id===studentId))throw new DatabaseError('Học sinh không tồn tại.');
    const old=(await this.list('attendance_tuition')).find(x=>x.record_type==='attendance'&&x.student_id===studentId&&x.class_date===date);
    const record={id:old?.id||makeId(),student_id:studentId,record_type:'attendance',class_date:date,attendance_status:attendanceStatus,
      tuition_month:null,tuition_year:null,fee_due:0,paid_amount:0,fee_status:null,paid_at:null,note:clean(note),created_at:old?.created_at||new Date().toISOString()};
    await this.storage.putMany('attendance_tuition',[record]);return record;
  }
  async saveTuition({studentId,month,year,paid,method='cash',reference=''}) {
    this.assertTeacher();
    const m=Number(month),y=Number(year);if(!Number.isInteger(m)||m<1||m>12||!Number.isInteger(y)||y<2020||y>2100)throw new DatabaseError('Tháng hoặc năm không hợp lệ.');
    const student=(await this.getStudents()).find(x=>x.id===studentId);if(!student)throw new DatabaseError('Học sinh không tồn tại.');
    const old=(await this.list('attendance_tuition')).find(x=>x.record_type==='tuition'&&x.student_id===studentId&&Number(x.tuition_month)===m&&Number(x.tuition_year)===y);
    const settings=await this.getSettings();const due=Number(old?.fee_due||student.custom_fee||settings.tuition_default_amount||0);
    if(!Number.isFinite(due)||due<=0)throw new DatabaseError('Chưa thiết lập mức học phí tháng cho học sinh.');
    const record={id:old?.id||makeId(),student_id:studentId,record_type:'tuition',class_date:null,attendance_status:null,
      tuition_month:m,tuition_year:y,fee_due:due,paid_amount:paid?due:0,fee_status:paid?'paid':'unpaid',
      payment_method:paid?method:null,payment_reference:paid?clean(reference):null,paid_at:paid?new Date().toISOString():null,
      created_at:old?.created_at||new Date().toISOString()};
    await this.storage.putMany('attendance_tuition',[record]);return record;
  }
  async resetDemo() { this.assertTeacher(); await this.storage.clear(); await this.init(); return {reset:true}; }
}

/** Real Supabase backend. RLS policies are the ultimate authorization layer. */
export class SupabaseAdapter {
  constructor(client, config=APP_CONFIG) { this.client=client; this.config=config; this.mode='supabase'; }
  async init() { return this; }
  async getSession() {
    const info=checked(await this.client.auth.getSession(),'Kiểm tra đăng nhập');
    const user=info?.session?.user??null;
    let role='guest';
    if(user) {
      const row=checked(await this.client.from('staff_roles').select('role').eq('user_id',user.id).maybeSingle(),'Xác định quyền');
      role=row?.role??'parent';
    }
    return {user,role,mode:'supabase'};
  }
  async assertTeacher() {
    const session=await this.getSession();
    if(!['teacher','admin'].includes(session.role))throw new DatabaseError('Tài khoản chưa được cấp quyền giáo viên trong Supabase.');
    return session;
  }
  async signInTeacher(email,password) {
    checked(await this.client.auth.signInWithPassword({email:clean(email),password:String(password??'')}),'Đăng nhập giáo viên');
    try { return await this.assertTeacher(); }
    catch(err){ await this.client.auth.signOut(); throw err; }
  }
  async requestPhoneOtp(phone) {
    const formatted=phoneToE164(phone);
    checked(await this.client.auth.signInWithOtp({phone:formatted,options:{shouldCreateUser:true}}),'Gửi OTP');
    return {sent:true,phone:formatted};
  }
  async verifyPhoneOtp(phone,code) {
    checked(await this.client.auth.verifyOtp({phone:phoneToE164(phone),token:clean(code),type:'sms'}),'Xác minh OTP');
    return this.getSession();
  }
  async signOut() { checked(await this.client.auth.signOut(),'Đăng xuất'); return {signedOut:true}; }
  async paged(queryFactory,label) {
    const out=[];
    for(let from=0;from<500000;from+=PAGE_SIZE) {
      const page=checked(await queryFactory().range(from,from+PAGE_SIZE-1),label)??[];
      out.push(...page);
      if(page.length<PAGE_SIZE) return out;
    }
    throw new DatabaseError(`${label}: dữ liệu vượt giới hạn phân trang an toàn.`);
  }
  async getStudents({grade,className,phone,active}={}) {
    const selected='id,student_code,full_name,grade,class_name,parent_phone,custom_fee,enrolled_on,active,note';
    return this.paged(()=>{
      let q=this.client.from('students').select(selected).order('student_code');
      if(grade!==undefined&&grade!=='')q=q.eq('grade',Number(grade));
      if(className)q=q.eq('class_name',className);
      if(phone)q=q.eq('parent_phone',normalizePhone(phone));
      if(active!==false)q=q.eq('active',true);
      return q;
    },'Lấy danh sách học sinh');
  }
  async getSettings({publicOnly=false}={}) {
    const rows=await this.paged(()=>{
      let q=this.client.from('app_settings').select('key,value,is_public').order('key');
      if(publicOnly)q=q.eq('is_public',true);
      return q;
    },'Đọc cài đặt');
    return Object.fromEntries(rows.map(x=>[x.key,x.value]));
  }
  async getLessonCatalog(grade) {
    return checked(await this.client.rpc('get_lesson_catalog',{p_grade:Number(grade)}),'Tải danh mục bài luyện')??[];
  }
  async getLessonQuestions(grade,lessonKey) {
    // Do not replace this with SELECT * FROM questions: keys are protected.
    return checked(await this.client.rpc('get_lesson_questions',{p_grade:Number(grade),p_lesson_key:lessonKey}),'Lấy câu hỏi')??[];
  }
  async getTeacherQuestions({grade,lessonKey}={}) {
    await this.assertTeacher();
    return this.paged(()=>{
      let q=this.client.from('questions').select('*').order('question_id');
      if(grade)q=q.eq('grade',Number(grade));
      if(lessonKey)q=q.eq('lesson_key',lessonKey);
      return q;
    },'Lấy ngân hàng câu hỏi giáo viên');
  }
  async getProgress(studentId) {
    return this.paged(()=>this.client.from('lesson_progress').select('*').eq('student_id',studentId).order('lesson_key'),'Lấy tiến độ học');
  }
  async submitLessonAttempt({studentId,grade,lessonKey,level,answers,requestId}={}) {
    if(!studentId || !lessonKey || !Number.isInteger(Number(level)) || !requestId) {
      throw new DatabaseError('Thiếu thông tin bài luyện tập.');
    }
    // Only the SQL RPC has access to answer keys and may write scored progress.
    return checked(await this.client.rpc('submit_lesson_attempt',{
      p_student_id:studentId,p_grade:Number(grade),p_lesson_key:String(lessonKey),
      p_level:Number(level),p_answers:answers,p_request_id:String(requestId),
    }),'Chấm điểm trên máy chủ');
  }

  async getClassSchedules({grade,className}={}) {
    return this.paged(()=>{
      let q=this.client.from('class_schedules').select('id,grade,class_name,weekday,start_time,duration_minutes,teacher_name,is_active')
        .eq('is_active',true).order('weekday');
      if(grade)q=q.eq('grade',Number(grade));
      if(className)q=q.eq('class_name',className);
      return q;
    },'Lấy lịch học');
  }
  async getAttendanceTuition({studentId,recordType,year,month}={}) {
    return this.paged(()=>{
      let q=this.client.from('attendance_tuition').select('*').order('created_at',{ascending:false});
      if(studentId)q=q.eq('student_id',studentId);
      if(recordType)q=q.eq('record_type',recordType);
      if(year)q=q.eq('tuition_year',Number(year));
      if(month)q=q.eq('tuition_month',Number(month));
      return q;
    },'Lấy điểm danh và học phí');
  }
  async upsertQuestions(rows) {
    await this.assertTeacher();
    // Stage 1 SQL lets only staff read/write questions, protects answer key.
    checked(await this.client.from('questions').upsert(rows,{onConflict:'question_id'}),'Lưu ngân hàng câu hỏi');
    return rows.length;
  }
  async upsertStudents(rows) {
    await this.assertTeacher();
    checked(await this.client.from('students').upsert(rows,{onConflict:'student_code'}),'Lưu học sinh');
    return rows.length;
  }
  async setLessonPublished(grade,lessonKey,published) {
    await this.assertTeacher();
    checked(await this.client.from('lesson_visibility').upsert({grade:Number(grade),lesson_key:lessonKey,is_published:!!published},{onConflict:'grade,lesson_key'}),'Cập nhật hiển thị bài học');
  }

  async getAllProgress(){await this.assertTeacher();return this.paged(()=>this.client.from('lesson_progress').select('*').order('student_id'),'Lấy thống kê luyện tập');}
  async getLessonVisibility(){await this.assertTeacher();return this.paged(()=>this.client.from('lesson_visibility').select('grade,lesson_key,is_published').order('grade'),'Đọc trạng thái công bố');}
  async saveStudent(row){
    await this.assertTeacher();
    const student_code=clean(row.student_code), full_name=clean(row.full_name),class_name=clean(row.class_name).toUpperCase(),grade=Number(row.grade);
    const parent_phone=row.parent_phone?normalizePhone(row.parent_phone):null;
    if(!student_code||full_name.length<2||!class_name||!Number.isInteger(grade)||grade<6||grade>12)throw new DatabaseError('Mã, tên, khối hoặc lớp không hợp lệ.');
    if(row.parent_phone&&!parent_phone)throw new DatabaseError('Số điện thoại phụ huynh không hợp lệ.');
    const custom_fee=row.custom_fee===''||row.custom_fee==null?null:Number(row.custom_fee);
    if(custom_fee!==null&&(!Number.isFinite(custom_fee)||custom_fee<0))throw new DatabaseError('Học phí riêng không hợp lệ.');
    const payload={student_code,full_name,grade,class_name,parent_phone,custom_fee,note:clean(row.note),active:row.active!==false};
    return checked(await this.client.from('students').upsert(payload,{onConflict:'student_code'}).select('id,student_code,full_name,grade,class_name,parent_phone,custom_fee,active').single(),'Lưu hồ sơ học sinh');
  }
  async saveSetting(key,value){
    await this.assertTeacher();if(!['tuition_default_amount'].includes(key))throw new DatabaseError('Cài đặt không được hỗ trợ.');
    checked(await this.client.from('app_settings').upsert({key,value,is_public:true},{onConflict:'key'}),'Lưu cài đặt');return true;
  }
  async saveAttendance({studentId,date,attendanceStatus,note=''}){
    await this.assertTeacher();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date))||!['present','absent','excused'].includes(attendanceStatus))throw new DatabaseError('Ngày hoặc trạng thái điểm danh không hợp lệ.');
    const current=checked(await this.client.from('attendance_tuition').select('id').eq('student_id',studentId).eq('record_type','attendance').eq('class_date',date).maybeSingle(),'Kiểm tra điểm danh');
    const payload={student_id:studentId,record_type:'attendance',class_date:date,attendance_status:attendanceStatus,note:clean(note),
      tuition_month:null,tuition_year:null,fee_due:0,paid_amount:0,fee_status:null,paid_at:null};
    if(current?.id)payload.id=current.id;
    return checked(await (current?.id
      ?this.client.from('attendance_tuition').update(payload).eq('id',current.id).select('*').single()
      :this.client.from('attendance_tuition').insert(payload).select('*').single()),'Lưu điểm danh');
  }
  async saveTuition({studentId,month,year,paid,method='cash',reference=''}){
    await this.assertTeacher();const m=Number(month),y=Number(year);
    if(!Number.isInteger(m)||m<1||m>12||!Number.isInteger(y)||y<2020||y>2100)throw new DatabaseError('Tháng hoặc năm không hợp lệ.');
    const student=checked(await this.client.from('students').select('id,custom_fee,active').eq('id',studentId).maybeSingle(),'Lấy học sinh');
    if(!student||!student.active)throw new DatabaseError('Không tìm thấy học sinh đang học.');
    const old=checked(await this.client.from('attendance_tuition').select('id,fee_due').eq('record_type','tuition').eq('student_id',studentId).eq('tuition_month',m).eq('tuition_year',y).maybeSingle(),'Kiểm tra thu học phí');
    const settings=await this.getSettings();const due=Number(old?.fee_due||student.custom_fee||settings.tuition_default_amount||0);
    if(!Number.isFinite(due)||due<=0)throw new DatabaseError('Chưa thiết lập mức học phí cho học sinh.');
    const payload={student_id:studentId,record_type:'tuition',class_date:null,attendance_status:null,
      tuition_month:m,tuition_year:y,fee_due:due,paid_amount:paid?due:0,fee_status:paid?'paid':'unpaid',
      payment_method:paid?method:null,payment_reference:paid?clean(reference):null,paid_at:paid?new Date().toISOString():null};
    if(old?.id)payload.id=old.id;
    return checked(await (old?.id
      ?this.client.from('attendance_tuition').update(payload).eq('id',old.id).select('*').single()
      :this.client.from('attendance_tuition').insert(payload).select('*').single()),'Lưu học phí');
  }
  async getUnpaidTuition(params) { await this.assertTeacher();return collectUnpaid(this,params); }
}

/** Business rule: tuition is binary PAID or UNPAID, never partially paid. */
async function collectUnpaid(adapter,{month,year,grade,className}={}) {
  if(!Number.isInteger(Number(month))||Number(month)<1||Number(month)>12||!Number.isInteger(Number(year))) {
    throw new DatabaseError('Hãy chọn tháng (1-12) và năm hợp lệ.');
  }
  const students=await adapter.getStudents({grade,className,active:true});
  const records=await adapter.getAttendanceTuition({recordType:'tuition',month,year});
  const byStudent=new Map(records.map(x=>[x.student_id,x]));
  const settings=await adapter.getSettings();
  const defaultFee=Number(settings.tuition_default_amount ?? 0);
  const rows=[]; const warnings=[];
  for(const student of students) {
    const paid=byStudent.get(student.id);
    if(paid?.fee_status==='paid')continue;
    const due=Number(paid?.fee_due || student.custom_fee || defaultFee || 0);
    if(!Number.isFinite(due)||due<=0) {
      warnings.push(`Chưa biết học phí của ${student.student_code}; không tự in thông báo.`);
      continue;
    }
    if(paid && paid.fee_status!=='unpaid') {
      warnings.push(`Trạng thái học phí chưa rõ: ${student.student_code}.`);
      continue;
    }
    const enrolled = student.enrolled_on ? new Date(`${String(student.enrolled_on).slice(0,10)}T00:00:00Z`) : null;
    if(enrolled && !Number.isNaN(enrolled.getTime()) && (enrolled.getUTCFullYear()>Number(year) || (enrolled.getUTCFullYear()===Number(year)&&enrolled.getUTCMonth()+1>Number(month))))continue;
    rows.push({...student,fee_due:due,paid_amount:0,fee_status:'unpaid',tuition_month:Number(month),tuition_year:Number(year)});
  }
  return {rows,warnings};
}

/**
 * Save workbook by batches of 300. Imported questions never overwrite the
 * in-memory list of lesson_progress. No automatic deletes.
 * Live mode: partial batches can commit before a later error; review result.
 */
export async function importWorkbookData(adapter, parsed, {onProgress, signal, batchSize=300}={}) {
  const questions=Array.isArray(parsed?.questions)?parsed.questions:[];
  const students=Array.isArray(parsed?.students)?parsed.students:[];
  const size=Math.max(1,Math.min(300,Number(batchSize)||300));
  if(adapter.mode==='supabase')await adapter.assertTeacher();
  else adapter.assertTeacher();
  const segments=[...batch(students,size).map(rows=>({type:'students',rows})),...batch(questions,size).map(rows=>({type:'questions',rows}))];
  const completed={students:0,questions:0,batches:0,totalBatches:segments.length};
  for(const part of segments) {
    if(signal?.aborted)throw new DatabaseError(`Đã dừng import. Đã lưu ${completed.questions} câu và ${completed.students} học sinh.`);
    try {
      const count=part.type==='students'?await adapter.upsertStudents(part.rows):await adapter.upsertQuestions(part.rows);
      completed[part.type]+=count;
      completed.batches++;
      onProgress?.({phase:'upload',percent:segments.length?Math.round(100*completed.batches/segments.length):100,...completed});
    } catch(err) {
      throw new DatabaseError(`Lỗi lô ${completed.batches+1}/${segments.length}. Đã lưu ${completed.questions} câu và ${completed.students} học sinh. ${err.message}`,err);
    }
    await yieldMain();
  }
  onProgress?.({phase:'complete',percent:100,...completed});
  return {...completed,mode:adapter.mode};
}

let cachedDB=null;
export async function createDatabase({config=APP_CONFIG,client=null,storage=null}={}) {
  const mode=resolveAppMode(config);
  if(mode==='demo')return new LocalDemoAdapter(config,storage).init();
  const supabaseClient=client??(await import(config.supabaseModuleUrl)).createClient(config.supabase.url,config.supabase.key,{
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true},
  });
  return new SupabaseAdapter(supabaseClient,config).init();
}
export async function getDatabase() {
  if(!cachedDB) cachedDB=createDatabase().catch(err=>{cachedDB=null;throw err;});
  return cachedDB;
}
export const getDatabaseMode = () => resolveAppMode();
