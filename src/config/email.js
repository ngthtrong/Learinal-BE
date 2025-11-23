module.exports = {
  provider: process.env.EMAIL_PROVIDER || "sendgrid",
  sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  sesRegion: process.env.SES_REGION || "",
  fromAddress: process.env.EMAIL_FROM || "no-reply@learinal.app",
  verifyTemplateId: process.env.EMAIL_VERIFY_TEMPLATE_ID || "",
  resetTemplateId: process.env.PASSWORD_RESET_TEMPLATE_ID || "",
};
