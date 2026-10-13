import React,{useRef,useState} from 'react';
import {CalendarExports} from './CalendarExports';
import {tenantApi} from '../lib/firebase';
import type {Appointment} from '../types';

export function CalendarInspector({appointments,date,tenantId,onSelectDate}:{appointments:Appointment[];date:string;tenantId:string;onSelectDate?:(date:string)=>void}) {
  const inspectRequest=useRef(0);
  const [events,setEvents]=useState<any[]>([]);
  const [selected,setSelected]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const rows=appointments.filter(a=>a.appointment_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time));
  const timestamp=(value?:string)=>value?new Date(value).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'לא תועד בעבר';
  const eventLabels:Record<string,string>={created:'התור נקבע',cancelled:'התור בוטל',rescheduled:'המועד הועבר',edited:'פרטי התור עודכנו'};

  async function inspect(a:Appointment) {
    const request=++inspectRequest.current;
    setEvents([]);setSelected(String(a.id));setError('');
    try {
      const d=await tenantApi('/api/admin/appointments/audit',{appointmentId:String(a.id)},tenantId);
      if(request===inspectRequest.current)setEvents(d.events);
    } catch(e:any) { setError(e.message); }
  }

  async function move(a:Appointment,e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');
    try {
      const f=new FormData(e.currentTarget);
      await tenantApi('/api/admin/appointments/update',{appointmentId:String(a.id),appointment:{appointment_date:f.get('date'),start_time:f.get('start'),end_time:f.get('end'),notes:f.get('notes')}},tenantId);
      window.dispatchEvent(new Event('appointments-changed'));setSelected('');
    } catch(e:any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4" dir="rtl">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">יומן ביקורת יומי — {date}</h2></div>
    <p className="text-xs text-slate-600">רשומות היום, כולל ביטולים, מועדים קודמים ותורים שאורכבו.</p>
    <div key={tenantId}><CalendarExports tenantId={tenantId}/></div>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {rows.length===0&&<p>אין תורים ביום זה.</p>}
    {rows.map(a=><article key={a.id} className={`border rounded-2xl p-3 ${a.status!=='active'||a.archivedAt?'bg-slate-100 text-slate-500':'bg-emerald-50'}`}>
      <button className="text-right w-full" onClick={()=>inspect(a)} title={a.status==='cancelled'?`${a.cancelledBy==='admin'?'מנהל':a.cancelledBy==='client'?'לקוח':'לא תועד בעבר'} | ${a.cancelledAt||'מועד לא תועד'} | ${a.cancellationReason||'ללא סיבה מתועדת'}`:a.status}>
        <strong className={a.status==='cancelled'?'line-through':''}><bdi dir="ltr">{a.start_time}–{a.end_time}</bdi> · {a.customer_name} · {a.service_name}</strong>
        <span className="block text-xs mt-1">{a.status==='active'?'פעיל':a.status==='cancelled'?'בוטל':'הועבר למועד אחר'}{a.archivedAt?' · ארכיון לאחר איפוס':''} · {a.customer_phone}</span>
      </button>
      {a.status==='cancelled'&&<div className="text-xs mt-2">ביטל: {a.cancelledBy==='admin'?'מנהל':a.cancelledBy==='client'?'לקוח':'לא תועד בגרסה הישנה'} · מתי: {a.cancelledAt?new Date(a.cancelledAt).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'לא תועד'}<br/>סיבה: {a.cancellationReason||'לא נמסרה'}</div>}
      {a.status==='rescheduled'&&<p className="text-xs">{(()=>{const next=appointments.find(row=>String(row.id)===a.rescheduledTo);return next?<button className="underline" onClick={()=>onSelectDate?.(next.appointment_date)}>הצגת המועד החדש: {next.appointment_date} <bdi dir="ltr">{next.start_time}</bdi></button>:'המועד הקודם נשמר בהיסטוריה';})()}</p>}
      {selected===String(a.id)&&<div className="mt-3 space-y-3">
        {a.originalCreatedAt&&<p className="text-xs">התור הראשון בשרשרת נוצר: {timestamp(a.originalCreatedAt)}</p>}
        <p className="text-xs">נוצר: {timestamp(a.createdAt||a.created_at)} · עודכן: {timestamp(a.updatedAt)}</p>
        {events.map(event=><div key={event.id} className="border-t text-xs py-2"><b>{eventLabels[event.type]||event.type} · {event.by==='admin'?'מנהל':'לקוח'} · {new Date(event.at).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}</b>{event.reason&&<p>{event.reason}</p>}{event.before&&<p>לפני: {event.before.appointment_date} {event.before.start_time}–{event.before.end_time}</p>}{event.after&&<p>אחרי: {event.after.appointment_date} {event.after.start_time}–{event.after.end_time}</p>}</div>)}
        {a.status==='active'&&!a.archivedAt&&<form className="flex flex-wrap gap-2" onSubmit={e=>move(a,e)}>
          <label>תאריך<input className="border p-2 rounded-lg block" name="date" type="date" required defaultValue={a.appointment_date}/></label>
          <label>התחלה<input className="border p-2 rounded-lg block" name="start" type="time" required defaultValue={a.start_time}/></label>
          <label>סיום<input className="border p-2 rounded-lg block" name="end" type="time" required defaultValue={a.end_time}/></label>
          <label>הערות<input className="border p-2 rounded-lg block" name="notes" defaultValue={a.notes||''}/></label>
          <button disabled={busy} className="bg-purple-700 text-white p-2 rounded-lg">שמירת שינוי מתועד</button>
        </form>}
      </div>}
    </article>)}
  </section>;
}
