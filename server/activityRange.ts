// Inclusive dates in the UI; Firestore queries use an exclusive next-day bound.
export function activityRange(input:any):{start:string;end:string;period:string} {
  const period=input?.period;
  if(!['month','year','range'].includes(period)) throw new Error('יש לבחור סוג תקופה תקין');
  if(period==='range') {
    const start=String(input.startDate||''),last=String(input.endDate||'');
    const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>=2000&&Number(value.slice(0,4))<=2100&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    if(!isDate(start)||!isDate(last)||start>last) throw new Error('יש לבחור טווח תאריכים תקין: מתאריך עד תאריך');
    const next=new Date(last+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
    return {start,end:next.toISOString().slice(0,10),period};
  }
  const year=Number(input.year),month=Number(input.month);
  if(!Number.isInteger(year)||year<2000||year>2100) throw new Error('יש לבחור שנה תקינה');
  if(period==='year') return {start:`${year}-01-01`,end:`${year+1}-01-01`,period};
  if(!Number.isInteger(month)||month<1||month>12) throw new Error('יש לבחור חודש תקין');
  return {start:`${year}-${String(month).padStart(2,'0')}-01`,end:month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`,period};
}
