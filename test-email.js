require('dotenv').config();
const sgMail = require('@sendgrid/mail');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const TEST_EMAIL_TO = 'ngthtrong204@gmail.com'; // Your email

sgMail.setApiKey(SENDGRID_API_KEY);

async function testEmail() {
  console.log('Testing SendGrid email...');
  console.log('From:', EMAIL_FROM);
  console.log('To:', TEST_EMAIL_TO);
  console.log('API Key:', SENDGRID_API_KEY ? 'SET (hidden)' : 'NOT SET');
  
  const msg = {
    to: TEST_EMAIL_TO,
    from: EMAIL_FROM,
    subject: 'Test Email - Plain Text',
    text: 'This is a test email from Learinal Backend',
    html: '<strong>This is a test email from Learinal Backend</strong>',
  };

  try {
    const response = await sgMail.send(msg);
    console.log('✅ Email sent successfully!');
    console.log('Status Code:', response[0].statusCode);
    console.log('Message ID:', response[0].headers['x-message-id']);
    console.log('\nCheck your inbox (and spam folder) at:', TEST_EMAIL_TO);
  } catch (error) {
    console.error('❌ Error sending email:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    if (error.response) {
      console.error('Response Body:', JSON.stringify(error.response.body, null, 2));
    }
  }
}

testEmail();
