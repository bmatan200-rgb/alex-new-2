const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(/<SalonInfoSection \/>/, '<SalonInfoSection scheduleSettings={scheduleSettings} />');
fs.writeFileSync('src/App.tsx', code);
