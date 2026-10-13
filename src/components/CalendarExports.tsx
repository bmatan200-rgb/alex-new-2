import React,{useState} from 'react';
import {tenantApi} from '../lib/firebase';
import {activityCsv} from '../utils/activityCsv';

export function CalendarExports({tenantId}:{tenantId:string}) {
  const [period,setPeriod]=useState<'month'|'year'|'range'>('month');
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const [month,setMonth]=useState(String(new Date().getMonth()+1));
  const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const download=(content:string,name:string,type:string)=>{
    const url=URL.createObjectURL(new Blob([content],{type}));
    const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
  };
  async function exportFile(full:boolean) {
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try {
      if(full) {
        const data=await tenantApi('/api/admin/calendar/export',{},tenantId);
        download(JSON.stringify(data.backup,null,2),`${tenantId}-calendar-${Date.now()}.json`,'application/json');
        setMessage('גיבוי היומן המלא הורד למכשיר.');
      } else {
        const data=await tenantApi('/api/admin/tenant-activity/export',{period,year:Number(year),month:Number(month),startDate,endDate},tenantId);
        const label=period==='range'?`${startDate}-to-${endDate}`:period==='year'?year:`${year}-${month.padStart(2,'0')}`;
        download(activityCsv(data.tenant.name,data.appointments),`${tenantId}-activity-${label}.csv`,'text/csv;charset=utf-8;');
        setMessage(`הדוח הורד למכשיר. נמצאו ${data.appointments.length} רשומות.`);
      }
    } catch(e:any) {setError(e.message||'הייצוא נכשל');}
    finally {setBusy(false);}
  }
  const control='mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900';
  return <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 text-slate-900" dir="rtl">
    <h3 className="font-bold text-base">ייצוא יומן ודוח פעילות</h3>
    <p className="text-xs text-slate-600">הדוח נבחר לפי תאריך התור וכולל ביטולים, העברות, רשומות ארכיון והיסטוריית שינויים. תאריך הסיום נכלל בדוח.</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="text-sm">תקופה<select className={control} value={period} onChange={e=>setPeriod(e.target.value as typeof period)} disabled={busy}><option value="month">חודש</option><option value="year">שנה שלמה</option><option value="range">מתאריך עד תאריך</option></select></label>
      {period!=='range'&&<label className="text-sm">שנה<input className={control} type="number" min="2000" max="2100" value={year} onChange={e=>setYear(e.target.value)} disabled={busy}/></label>}
      {period==='month'&&<label className="text-sm">חודש<select className={control} value={month} onChange={e=>setMonth(e.target.value)} disabled={busy}>{Array.from({length:12},(_,i)=><option key={i+1} value={String(i+1)}>{new Date(2000,i,1).toLocaleDateString('he-IL',{month:'long'})}</option>)}</select></label>}
      {period==='range'&&<><label className="text-sm">מתאריך<input className={control} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} disabled={busy}/></label><label className="text-sm">עד תאריך<input className={control} type="date" min={startDate||undefined} value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={busy}/></label></>}
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy||(period==='range'&&(!startDate||!endDate||startDate>endDate))} onClick={()=>exportFile(false)} className="bg-purple-700 text-white rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50">{busy?'מכין קובץ…':'הורדת דוח CSV לאקסל'}</button>
      <button type="button" disabled={busy} onClick={()=>exportFile(true)} className="bg-slate-100 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50">הורדת גיבוי יומן מלא — JSON</button>
    </div>
    {message&&<p role="status" className="text-sm text-green-700">{message}</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-xs text-slate-600">המחיר הרשום בתור אינו אישור לתשלום. הדוח אינו מחליף קבלות וחשבוניות.</p>
  </section>;
}
