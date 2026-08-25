const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
/return \{\s*success: false,\s*error: friendlyError,\s*\};/g,
`return {
      success: false,
      error: friendlyError + (!friendlyError.includes('ניסיון שליחה') ? debugContext : ''),
    };`
);

fs.writeFileSync('server.ts', code);
