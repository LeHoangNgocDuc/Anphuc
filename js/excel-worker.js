/* AN PHUC EDUCATION - Excel ZIP decoding off the main thread. */
/* global XLSX, importScripts, self */
'use strict';
self.onmessage=function(event){
  if(event.data?.type!=='parse')return;
  try {
    self.postMessage({type:'progress',percent:5,message:'Worker đang nạp SheetJS'});
    importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    if(typeof XLSX==='undefined')throw new Error('Không thể nạp SheetJS từ CDN.');
    self.postMessage({type:'progress',percent:20,message:'Giải mã file Excel trong Worker'});
    const workbook=XLSX.read(event.data.buffer,{type:'array',cellDates:false,dense:true});
    const normalize = x => String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
    const permitted=new Set(['questionbank','toanthpt','toanthcs','studentlist','danhsachhocsinh','students']);
    const names=workbook.SheetNames.filter(x=>permitted.has(normalize(x)));
    const sheets=[];
    for(let i=0;i<names.length;i++) {
      const name=names[i];
      sheets.push({name,rows:XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:'',raw:true,blankrows:false})});
      self.postMessage({type:'progress',percent:Math.round(30+70*(i+1)/names.length),message:`Đã đọc sheet ${name}`});
    }
    self.postMessage({type:'result',sheets});
  } catch(err) { self.postMessage({type:'error',message:String(err?.message||err)}); }
};
