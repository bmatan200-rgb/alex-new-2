function cleanPhoneForWhatsApp(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.substring(1);
  }
  if (!cleaned.startsWith('+') && !cleaned.startsWith('972') && cleaned.length <= 10) {
    cleaned = '972' + cleaned;
  }
  return cleaned;
}

let fromNumber = "12015550123";
let toNumber = cleanPhoneForWhatsApp("0546307114");

fromNumber = fromNumber.replace(/^whatsapp:/i, '').trim();
if (!fromNumber.startsWith('+') && fromNumber.length >= 7) {
  fromNumber = `+${fromNumber}`;
}
toNumber = toNumber.replace(/^whatsapp:/i, '').trim();
if (!toNumber.startsWith('+')) {
  toNumber = `+${toNumber}`;
}
console.log({fromNumber, toNumber});
