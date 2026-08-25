const fs = require('fs');

function replaceInFile(file, regex, replacement) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(regex, replacement);
  fs.writeFileSync(file, code);
}

replaceInFile('server.ts', /\|\| 'whatsapp'/g, "|| 'sms'");
replaceInFile('src/components/WhatsAppReminderModal.tsx', /twilioType: settings\.twilioType \|\| 'whatsapp'/g, "twilioType: settings.twilioType || 'sms'");
replaceInFile('src/utils/whatsappReminder.ts', /twilioType: settings\.twilioType \|\| 'whatsapp'/g, "twilioType: settings.twilioType || 'sms'");

console.log("Done");
