import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createXlsx,reportPrintHtml} from '../src/utils/reportFiles';

test('Excel exporter creates a valid multi-sheet OOXML workbook with Hebrew and escaped values',async()=>{
 const blob=createXlsx([{name:'לקוחות',rows:[['שם','הערה'],['נועה','<בדיקה>']]},{name:'יומן',rows:[['תאריך','תור'],['2030-01-01',3]]}]);
 const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
 const dir=await mkdtemp(join(tmpdir(),'report-xlsx-')),file=join(dir,'report.xlsx');
 try{await writeFile(file,bytes);const check=spawnSync('unzip',['-t',file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr||check.stdout);
  const workbook=spawnSync('unzip',['-p',file,'xl/workbook.xml'],{encoding:'utf8'});assert.equal(workbook.status,0);assert.ok(workbook.stdout.includes('לקוחות')&&workbook.stdout.includes('יומן'));
  const sheet=spawnSync('unzip',['-p',file,'xl/worksheets/sheet1.xml'],{encoding:'utf8'});assert.ok(sheet.stdout.includes('&lt;בדיקה&gt;'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('print report escapes customer supplied HTML and produces a print-to-PDF page',()=>{
 const html=reportPrintHtml('דוח עסק',[{title:'לקוחות',headers:['שם'],rows:[['<script>alert(1)</script>']]}]);
 assert.ok(html.includes('window.print()'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert'));
});
