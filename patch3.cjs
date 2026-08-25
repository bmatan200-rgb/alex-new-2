const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
/let friendlyError = err\?\.message \|\| 'שגיאה בשליחת ההודעה דרך Twilio\.';/,
`let friendlyError = \`שגיאה משרת Twilio: \${err?.message || 'שגיאה לא ידועה'}\`;
    
    // Add context about numbers tried
    const debugContext = \` (ניסיון שליחה אל: \${toNumber}, ממספר: \${fromNumber})\`;`
);

code = code.replace(
/    } else if \(err\?\.code === 21211 \|\| err\?\.message\?\.includes\('not a valid phone number'\)\) \{/,
`    } else if (err?.code === 21408 || err?.message?.includes('Permission to send an SMS has not been enabled')) {
      friendlyError = 'שגיאת הרשאות יעד ב-Twilio (Geo Permissions): חשבונך חסום לשליחת SMS לישראל. יש להתחבר ל-Twilio, לנווט ל-Messaging -> Settings -> Geo Permissions ולאפשר שליחת SMS לישראל (Israel).' + debugContext;
    } else if (err?.code === 21211 || err?.message?.includes('not a valid phone number')) {`
);

fs.writeFileSync('server.ts', code);
