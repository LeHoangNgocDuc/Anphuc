/** Pure report, tuition and print calculations. No user data is written here. */
export function validMonthYear(month,year) {
  const m=Number(month), y=Number(year);
  return Number.isInteger(m)&&m>=1&&m<=12&&Number.isInteger(y)&&y>=2020&&y<=2100;
}
export function monthlyTuitionRows(students,records,{month,year,grade='',className='',defaultFee=0}={}) {
  if(!validMonthYear(month,year))throw new Error('Tháng hoặc năm không hợp lệ.');
  const m=Number(month),y=Number(year);
  const recordsByStudent=new Map();
  for(const row of records||[]) {
    if(row.record_type!=='tuition'||Number(row.tuition_month)!==m||Number(row.tuition_year)!==y)continue;
    // DB unique record per student/month. Last duplicate wins for demo corrupt data.
    recordsByStudent.set(row.student_id,row);
  }
  return (students||[]).filter(s=>s.active!==false)
    .filter(s=>!grade||Number(s.grade)===Number(grade))
    .filter(s=>!className||s.class_name===className)
    .filter(s=>{
      if(!s.enrolled_on)return true;
      const match=/^(\d{4})-(\d{2})/.exec(String(s.enrolled_on));
      return !match||Number(match[1])*12+Number(match[2])<=y*12+m;
    })
    .map(s=>{
      const r=recordsByStudent.get(s.id);
      const fee=Number(r?.fee_due||s.custom_fee||defaultFee||0);
      const known=Number.isFinite(fee)&&fee>0;
      return {...s,fee_due:known?fee:0,paid_amount:r?.fee_status==='paid'?(known?fee:Number(r?.paid_amount)||0):0,
        fee_status:r?.fee_status==='paid'?'paid':'unpaid',tuition_month:m,tuition_year:y,
        fee_known:known};
    });
}
export function dashboardReport(students,progress,records,{month,year,grade='',className='',defaultFee=0}={}) {
  const available=(students||[]).filter(s=>s.active!==false).filter(s=>!grade||Number(s.grade)===Number(grade)).filter(s=>!className||s.class_name===className);
  const byStudent=new Map();
  for(const p of progress||[]) {
    const data=byStudent.get(p.student_id)||[];data.push(p);byStudent.set(p.student_id,data);
  }
  const ranked=available.map(s=>{
    const p=byStudent.get(s.id)||[];
    const total=p.length;
    const avg=total?p.reduce((a,x)=>a+(Number(x.best_overall)||0),0)/total:0;
    return {student:s,score:Math.round(avg*100)/100,lessons:total,
      completed:p.filter(x=>x.is_completed).length,attempts:p.reduce((a,x)=>a+(Number(x.attempts_count)||0),0)};
  }).sort((a,b)=>b.score-a.score||b.attempts-a.attempts||a.student.full_name.localeCompare(b.student.full_name,'vi'));
  const tuition=monthlyTuitionRows(available,records,{month,year,defaultFee});
  const attention=ranked.filter(x=>x.attempts===0);
  const paid=tuition.filter(x=>x.fee_status==='paid').length;
  const unpaid=tuition.filter(x=>x.fee_status==='unpaid'&&x.fee_known).length;
  const unknown=tuition.filter(x=>!x.fee_known).length;
  const allowedIds=new Set(available.map(x=>x.id));
  const attendance=(records||[]).filter(x=>x.record_type==='attendance'&&allowedIds.has(x.student_id));
  return {ranked,attention,tuition,summary:{students:available.length,paid,unpaid,unknown,
    unpaidMoney:tuition.filter(x=>x.fee_status==='unpaid'&&x.fee_known).reduce((a,x)=>a+x.fee_due,0),
    attendance:attendance.length,absent:attendance.filter(x=>x.attendance_status==='absent').length,
    average:ranked.length?Math.round(ranked.reduce((a,x)=>a+x.score,0)/ranked.length*100)/100:0}};
}
export function paginateNotices(rows,paper='a4') {
  if(!['a4','a5'].includes(paper))throw new Error('Khổ giấy không hợp lệ.');
  const size=paper==='a4'?2:1,result=[];
  for(let i=0;i<rows.length;i+=size)result.push(rows.slice(i,i+size));
  return result;
}
export function validatePrintRows(rows) {
  const seen=new Set();
  for(const r of rows) {
    if(r.fee_status!=='unpaid'||!Number.isFinite(Number(r.fee_due))||Number(r.fee_due)<=0)
      throw new Error('Danh sách in chứa học sinh đã đóng hoặc chưa xác định học phí.');
    if(seen.has(r.id))throw new Error('Danh sách in bị trùng học sinh.');
    seen.add(r.id);
  }
  return rows;
}
