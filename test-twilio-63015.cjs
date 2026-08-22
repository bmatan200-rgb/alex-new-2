const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
client.messages.create({
  body: 'Hello',
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+972546307114'
}).then(message => console.log('63014:', message.sid))
.catch(err => console.error(err.code, err.message));
