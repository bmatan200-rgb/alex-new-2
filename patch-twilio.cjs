const fs = require('fs');
function replaceInFile(file, regex, replacement) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(regex, replacement);
  fs.writeFileSync(file, code);
}

replaceInFile('server.ts', /process\.env\.TWILIO_PHONE_NUMBER \|\| 'whatsapp:\+14155238886'/g, "process.env.TWILIO_PHONE_NUMBER || ''");
replaceInFile('server.ts', /twilioPhoneNumber: activeServerSettings\?\.twilioPhoneNumber \|\| process\.env\.TWILIO_PHONE_NUMBER \|\| 'whatsapp:\+14155238886',/g, "twilioPhoneNumber: activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '',");

console.log("Patched server.ts");
