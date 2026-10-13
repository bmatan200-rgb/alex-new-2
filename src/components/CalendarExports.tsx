import React,{useState} from 'react';
import {tenantApi} from '../lib/firebase';
import {createXlsx,openPrintReport, type ReportSheet} from '../utils/reportFiles';

export function CalendarExports({tenantId}:{tenantId:string}) {
  const [period,setPeriod]=useState<'month'|'year'|'range'>('month');
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const [month,setMonth]=useState(String(new Date().getMonth()+1));
  const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const download=(content:Blob|string,name:string,type:string)=>{
    const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type}));
    const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
  };
  const label=period==='range'?`${startDate}-to-${endDate}`:period==='year'?year:`${year}-${month.padStart(2,'0')}`;
  const historyRows=(data:any[])=>data.flatMap(a=>(a.audit||[]).map((e:any)=>[a.appointment_date,a.start_time,a.customer_name,a.customer_phone,e.at,e.type,e.reason||'',e.before?JSON.stringify(e.before):'',e.after?JSON.stringify(e.after):'']));
  const sheets=(data:any):ReportSheet[]=>[
    {name:'פרטי העסק והגדרות',rows:[['פרט','ערך'],...Object.entries(data.tenant||{}),...Object.entries(data.settings?.config?.scheduleSettings||{}).map(([k,v])=>[`שעות פעילות: ${k}`,v]),['שירותים',''],...(data.settings?.config?.services||[]).map((s:any)=>[s.name,s.price,`${s.duration_minutes} דקות`,s.description||''])]},
    {name:'לקוחות',rows:[['שם','טלפון','הערות','נוצר בתאריך','כניסה אחרונה'],...(data.customers||[]).map((c:any)=>[c.full_name,c.phone,c.notes,c.created_at,c.last_login_at])]},
    {name:'תורים בטווח',rows:[['תאריך','התחלה','סיום','שם לקוח/ה','טלפון','שירות','מחיר רשום','סטטוס','מועד ביטול','סיבת ביטול'],...(data.appointments||[]).map((a:any)=>[a.appointment_date,a.start_time,a.end_time,a.customer_name,a.customer_phone,a.service_name,a.price,a.status,a.cancelledAt,a.cancellationReason])]},
    {name:'היסטוריית שינויים',rows:[['תאריך התור','שעה','שם','טלפון','מועד השינוי','סוג שינוי','סיבה','מצב קודם','מצב לאחר שינוי'],...historyRows(data.appointments||[])]},
    {name:'הודעות SMS',rows:[['תאריך','טלפון','סוג תזכורת','סטטוס','תוכן','נשלח בתאריך'],...(data.smsLogs||[]).map((m:any)=>[m.appointmentDate,m.recipientPhone,m.reminderType,m.status,m.message,m.sentAt])]},
  ];
  async function exportFile(mode:'xlsx'|'pdf'|'calendar') {
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try {
      if(mode==='calendar') {
        const data=await tenantApi('/api/admin/calendar/export',{},tenantId);
        download(JSON.stringify(data.backup,null,2),`${tenantId}-calendar-${Date.now()}.json`,'application/json');
        setMessage('גיבוי היומן המלא הורד למכשיר.');
      } else {
        const printTab=mode==='pdf'?window.open('about:blank','_blank'):null;
        if(mode==='pdf'&&!printTab)throw new Error('יש לאפשר פתיחת חלון כדי לשמור PDF');
        const data=await tenantApi('/api/admin/business-export',{period,year:Number(year),month:Number(month),startDate,endDate},tenantId);
        const exportSheets=sheets(data);
        if(mode==='xlsx')download(createXlsx(exportSheets),`${tenantId}-business-data-${label}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        else openPrintReport(`${data.tenant.name} — ייצוא עסק ${label}`,exportSheets.map(s=>({title:s.name,headers:(s.rows[0]||[]).map(String),rows:s.rows.slice(1)})),printTab);
        setMessage(`הקובץ הופק. בדוח ${data.appointments.length} תורים ו-${data.customers.length} לקוחות.`);
      }
    } catch(e:any) {setError(e.message||'הייצוא נכשל');}
    finally {setBusy(false);}
  }
  const control='mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900';
  return <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 text-slate-900" dir="rtl">
    <h3 className="font-bold text-base">הורדת פרטי העסק והפעילות</h3>
    <p className="text-xs text-slate-600">קובץ Excel כולל לשוניות לפרטי העסק, השירותים, כל הלקוחות, התורים בטווח, היסטוריית השינויים ותזכורות SMS. טווח התאריכים מסנן תורים והודעות; רשימת הלקוחות כוללת את כל הלקוחות השמורים בעסק.</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="text-sm">תקופה<select className={control} value={period} onChange={e=>setPeriod(e.target.value as typeof period)} disabled={busy}><option value="month">חודש</option><option value="year">שנה שלמה</option><option value="range">מתאריך עד תאריך</option></select></label>
      {period!=='range'&&<label className="text-sm">שנה<input className={control} type="number" min="2000" max="2100" value={year} onChange={e=>setYear(e.target.value)} disabled={busy}/></label>}
      {period==='month'&&<label className="text-sm">חודש<select className={control} value={month} onChange={e=>setMonth(e.target.value)} disabled={busy}>{Array.from({length:12},(_,i)=><option key={i+1} value={String(i+1)}>{new Date(2000,i,1).toLocaleDateString('he-IL',{month:'long'})}</option>)}</select></label>}
      {period==='range'&&<><label className="text-sm">מתאריך<input className={control} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} disabled={busy}/></label><label className="text-sm">עד תאריך<input className={control} type="date" min={startDate||undefined} value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={busy}/></label></>}
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy||(period==='range'&&(!startDate||!endDate||startDate>endDate))} onClick={()=>exportFile('xlsx')} className="bg-purple-700 text-white rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50">{busy?'מכין קובץ…':'הורדת Excel מלא'}</button>
      <button type="button" disabled={busy||(period==='range'&&(!startDate||!endDate||startDate>endDate))} onClick={()=>exportFile('pdf')} className="bg-slate-100 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50">הדפסה / שמירה כ-PDF</button>
      <button type="button" disabled={busy} onClick={()=>exportFile('calendar')} className="bg-slate-100 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50">גיבוי יומן מלא — JSON</button>
    </div>
    {message&&<p role="status" className="text-sm text-green-700">{message}</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-xs text-slate-600">PDF נפתח בחלון ההדפסה; שם אפשר לבחור ״שמירה כ-PDF״. המחיר הרשום ביומן אינו אישור לתשלום ואינו מחליף קבלות וחשבוניות.</p>
  </section>;
}
