export function smsDeliveryView(status: string, checked = false) {
  switch (status) {
    case 'delivered': return {label:'נמסר לפי אישור הספק',tone:'success'};
    case 'failed': return {label:'נכשל',tone:'error'};
    case 'queued': return {label:'התקבל אצל הספק — ממתין למסירה',tone:'pending'};
    case 'sending': return {label:'בתהליך שליחה',tone:'pending'};
    case 'sent': return {label:checked?'הועבר לרשת — טרם אושרה מסירה':'רישום ישן — המסירה לא אומתה',tone:'pending'};
    case 'unconfirmed': return {label:'אין אישור מסירה',tone:'pending'};
    default: return {label:'התוצאה אינה ידועה — נדרשת בדיקה',tone:'pending'};
  }
}
