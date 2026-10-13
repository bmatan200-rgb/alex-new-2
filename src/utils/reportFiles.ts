export type ReportSheet = { name: string; rows: Array<Array<unknown>> };

export function businessBackupSheets(backup:any):ReportSheet[] {
  const tree=backup?.tenant||{},collections=tree.collections||{};
  const legacy=backup?.related?.legacy||[];
  const legacyIn=(name:string)=>legacy.filter((x:any)=>x.path?.split('/')[0]===name);
  const appointmentDocs=[...(collections.appointments||[]),...legacyIn('appointments').map((x:any)=>({id:x.path.split('/').at(-1),data:x.data,collections:x.collections}))];
  const appointments=[...new Map(appointmentDocs.map((a:any)=>[a.id,{...a.data,id:a.id,audit:(a.collections?.audit||[]).map((e:any)=>({...e.data,id:e.id}))}])).values()];
  const customerDocs=[...(collections.customers||[]),...legacyIn('customers').map((x:any)=>({id:x.path.split('/').at(-1),data:x.data}))];
  const customers=[...new Map(customerDocs.map((c:any)=>[c.id,c.data||{}])).values()];
  const sms=[...(collections.sms_logs||[]),...(backup?.related?.sms_logs||[]),...legacyIn('sms_logs')].map((m:any)=>m.data||m);
  return [
    {name:'פרטי העסק והגדרות',rows:[['פרט','ערך'],...Object.entries(tree.data||{}).filter(([k])=>!/(password|secret|token|credential|apiKey)/i.test(k)),...Object.entries(collections.settings?.find((x:any)=>x.id==='config')?.data?.scheduleSettings||{}).map(([k,v])=>[`שעות פעילות: ${k}`,v]),['שירותים',''],...(collections.settings?.find((x:any)=>x.id==='config')?.data?.services||[]).map((s:any)=>[s.name,s.price,`${s.duration_minutes} דקות`,s.description||''])]},
    {name:'לקוחות',rows:[['שם','טלפון','הערות','נוצר בתאריך','כניסה אחרונה'],...customers.map((c:any)=>[c.full_name,c.phone,c.notes,c.created_at,c.last_login_at])]},
    {name:'כל התורים',rows:[['תאריך','התחלה','סיום','שם לקוח/ה','טלפון','שירות','מחיר רשום','סטטוס','מזהה תור'],...appointments.map((a:any)=>[a.appointment_date,a.start_time,a.end_time,a.customer_name,a.customer_phone,a.service_name,a.price,a.status,a.id])]},
    {name:'היסטוריית שינויים',rows:[['תאריך התור','שעה','שם','טלפון','מועד השינוי','סוג שינוי','סיבה','מצב קודם','מצב לאחר שינוי'],...appointments.flatMap((a:any)=>(a.audit||[]).map((e:any)=>[a.appointment_date,a.start_time,a.customer_name,a.customer_phone,e.at,e.type,e.reason||'',e.before?JSON.stringify(e.before):'',e.after?JSON.stringify(e.after):'']))]},
    {name:'הודעות SMS',rows:[['תאריך התור','טלפון','סוג תזכורת','סטטוס','נשלח בתאריך'],...sms.map((m:any)=>[m.appointmentDate,m.recipientPhone,m.reminderType,m.status,m.sentAt])]},
  ];
}

const utf8 = new TextEncoder();
const xml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const columnName = (n:number) => { let s=''; for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s; return s; };

function crc32(bytes:Uint8Array) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function zipStore(files:Array<{name:string;content:string}>) {
  const chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
  const put=(length:number,write:(v:DataView)=>void)=>{const b=new Uint8Array(length);write(new DataView(b.buffer));return b;};
  for(const file of files){
    const name=utf8.encode(file.name),data=utf8.encode(file.content),crc=crc32(data);
    const local=put(30+name.length,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(8,0,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);});
    local.set(name,30);chunks.push(local,data);
    const header=put(46+name.length,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(10,0,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);});
    header.set(name,46);central.push(header);offset+=local.length+data.length;
  }
  const centralSize=central.reduce((n,x)=>n+x.length,0),end=put(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);});
  return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export function createXlsx(sheets:ReportSheet[]) {
  const safe=sheets.slice(0,25).map((s,i)=>({...s,name:(s.name||`Sheet${i+1}`).slice(0,31).replace(/[\\/*?:\[\]]/g,'_')}));
  const files=[
    {name:'[Content_Types].xml',content:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safe.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',content:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',content:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safe.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${safe.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml',content:'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>'},
    ...safe.map((sheet,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,content:`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>${sheet.rows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>{const ref=`${columnName(c)}${r+1}`;if(typeof value==='number'&&Number.isFinite(value))return `<c r="${ref}"><v>${value}</v></c>`;return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${columnName(Math.max(0,...sheet.rows.map(x=>x.length))-1)}${Math.max(1,sheet.rows.length)}"/></worksheet>`}))
  ];
  return zipStore(files);
}

export function reportPrintHtml(title:string, sections:Array<{title:string;headers:string[];rows:Array<Array<unknown>>}>) {
  const table=(section:typeof sections[number])=>`<section><h2>${xml(section.title)}</h2><table><thead><tr>${section.headers.map(x=>`<th>${xml(x)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row=>`<tr>${row.map(v=>`<td>${xml(v instanceof Date?v.toLocaleString('he-IL'):typeof v==='object'?JSON.stringify(v):v)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${xml(title)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:24px}h1{font-size:22px}h2{font-size:16px;margin-top:26px}p{color:#475569}table{border-collapse:collapse;width:100%;font-size:9px;table-layout:fixed}th,td{border:1px solid #cbd5e1;padding:5px;overflow-wrap:anywhere;text-align:right}th{background:#e8edf5}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}}</style></head><body><h1>${xml(title)}</h1><p>הופק ${new Date().toLocaleString('he-IL')}</p>${sections.map(table).join('')}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))</script></body></html>`;
}

export function openPrintReport(title:string,sections:Parameters<typeof reportPrintHtml>[1],existingTab?:Window|null) {
  const tab=existingTab||window.open('','_blank');if(!tab)throw new Error('יש לאפשר פתיחת חלון כדי להפיק PDF');
  tab.document.open();tab.document.write(reportPrintHtml(title,sections));tab.document.close();
}
