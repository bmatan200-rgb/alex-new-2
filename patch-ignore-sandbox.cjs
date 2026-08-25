const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
/const twilioPhoneNumber = params\.twilioPhoneNumber \|\| activeServerSettings\?\.twilioPhoneNumber \|\| process\.env\.TWILIO_PHONE_NUMBER \|\| '';/,
`let twilioPhoneNumber = params.twilioPhoneNumber || activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
  if (twilioPhoneNumber === 'whatsapp:+14155238886' && (process.env.TWILIO_TYPE === 'sms' || activeServerSettings?.twilioType === 'sms')) {
    twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
  }`
);

fs.writeFileSync('server.ts', code);
console.log("Patched ignore sandbox");
