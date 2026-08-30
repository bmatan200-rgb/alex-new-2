const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

// For Morning automated run
content = content.replace(/const res = await sendWhatsAppViaProvider\(\{([\s\S]*?)message: morningMessage,\s*\}\);\s*if \(!res\.success\) \{\s*console\.warn\(\`\[Auto Morning Runner\] Note: dispatch status:\`, res\.error\);\s*\}/g, 
`const res = await sendWhatsAppViaProvider({$1message: morningMessage,
          });
          if (!res.success) {
            console.warn(\`[Auto Morning Runner] Note: dispatch status:\`, res.error);
            await logMessageToFirestore(firstAppt.id, firstAppt.customer_phone, 'morning_reminder', false, morningMessage, res.error);
          } else {
            await logMessageToFirestore(firstAppt.id, firstAppt.customer_phone, 'morning_reminder', true, morningMessage);
          }`);

// For Evening automated run
content = content.replace(/const res = await sendWhatsAppViaProvider\(\{([\s\S]*?)message: eveningMessage,\s*\}\);\s*if \(!res\.success\) \{\s*console\.warn\(\`\[Auto Evening Runner\] Note: dispatch status:\`, res\.error\);\s*\}/g,
`const res = await sendWhatsAppViaProvider({$1message: eveningMessage,
          });
          if (!res.success) {
            console.warn(\`[Auto Evening Runner] Note: dispatch status:\`, res.error);
            await logMessageToFirestore(firstAppt.id, firstAppt.customer_phone, 'evening_reminder', false, eveningMessage, res.error);
          } else {
            await logMessageToFirestore(firstAppt.id, firstAppt.customer_phone, 'evening_reminder', true, eveningMessage);
          }`);

fs.writeFileSync('server.ts', content);
