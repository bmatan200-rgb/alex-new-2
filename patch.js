const fs = require('fs');
let code = fs.readFileSync('src/components/SalonInfoSection.tsx', 'utf-8');
code = code.replace(/\{SALON_INFO\.openingHours\.map.*?\)\)\}/s, `
            <div className="flex justify-between items-center py-2 border-b border-slate-200/70">
              <span className="font-semibold text-slate-700">ראשון - חמישי</span>
              <span className="font-black text-slate-900 font-['Rubik',sans-serif] bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                {scheduleSettings?.businessOpen || '09:20'} - {scheduleSettings?.businessClose || '20:30'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-200/70">
              <span className="font-semibold text-slate-700">שישי</span>
              <span className="font-black text-slate-900 font-['Rubik',sans-serif] bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                {scheduleSettings?.fridayOpen || '09:20'} - {scheduleSettings?.fridayClose || '15:00'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-200/70 last:border-0">
              <span className="font-semibold text-slate-700">שבת</span>
              <span className="font-black text-slate-900 font-['Rubik',sans-serif] bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                סגור (מנוחה)
              </span>
            </div>
`);
fs.writeFileSync('src/components/SalonInfoSection.tsx', code);
