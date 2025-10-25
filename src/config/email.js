module.exports = {
  provider: process.env.EMAIL_PROVIDER || 'sendgrid',
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  sesRegion: process.env.SES_REGION || '',
  fromAddress: process.env.EMAIL_FROM || 'no-reply@learinal.app',
};
