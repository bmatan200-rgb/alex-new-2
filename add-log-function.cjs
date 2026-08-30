const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const logFunc = `
async function logMessageToFirestore(apptId: string, phone: string, type: string, success: boolean, message: string, errorMsg?: string) {
  if (!db) return;
  try {
    const timestamp = new Date().toISOString();
    await addDoc(collection(db, 'whatsapp_logs'), {
      appointmentId: apptId,
      phone,
      type,
      success,
      message,
      error: errorMsg || null,
      timestamp
    });
  } catch (err) {
    console.warn('[Server] Could not sync log to Firestore:', err);
  }
}
`;

content = content.replace('function hasSentReminder(key: string) {', logFunc + '\nfunction hasSentReminder(key: string) {');
fs.writeFileSync('server.ts', content);
