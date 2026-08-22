(async () => {
  const twilioModule = await import('twilio');
  const twilioFactory = twilioModule.default || twilioModule;
  console.log('Type of factory:', typeof twilioFactory);
})();
