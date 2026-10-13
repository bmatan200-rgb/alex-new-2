export function activityCsv(tenantName:string,appointments:any[]):string {
  const cell=(value:any)=>{
    let text=String(value??'');
    if(/^[\s]*[=+@-]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  const timestamp=(value:any)=>value?new Date(value).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'';
  const status:Record<string,string>={active:'פעיל',cancelled:'בוטל',rescheduled:'הועבר למועד אחר'};
  const eventTypes:Record<string,string>={created:'נקבע',cancelled:'בוטל',rescheduled:'הועבר',edited:'עודכן'};
  const headers=['עסק','תאריך התור','שעת התחלה','שעת סיום','שם לקוחה','טלפון','טיפול','מחיר רשום לתור','סטטוס','ביומן ארכיון','מועד ביטול','מי ביטל','סיבת ביטול','נוצר בתאריך','עודכן לאחרונה','היסטוריית שינויים'];
  const rows=[...appointments].sort((a,b)=>String(a.appointment_date).localeCompare(String(b.appointment_date))||String(a.start_time).localeCompare(String(b.start_time))).map(a=>[
    tenantName,a.appointment_date,a.start_time,a.end_time,a.customer_name,a.customer_phone,a.service_name,a.price??'',status[a.status]||a.status,a.archivedAt?'כן':'לא',timestamp(a.cancelledAt),a.cancelledBy,a.cancellationReason,a.createdAt||a.created_at,a.updatedAt||a.updated_at,
    (a.audit||[]).map((e:any)=>`${timestamp(e.at)} ${eventTypes[e.type]||e.type} ${e.after?`${e.after.appointment_date||''} ${e.after.start_time||''}`:''}${e.reason?` סיבה: ${e.reason}`:''}`.trim()).join(' | ')
  ]);
  return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
}
