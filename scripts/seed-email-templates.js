/**
 * Seed script: Create email templates
 * Run: node scripts/seed-email-templates.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const mongoConfig = require("../src/config/mongo");
const EmailTemplate = require("../src/models/emailTemplate.model");

const templates = [
  {
    templateId: "welcome",
    name: "Welcome Email",
    subject: "Welcome to Learinal!",
    category: "Auth",
    variables: ["userName", "loginUrl"],
    bodyHtml: `
      <h1>Welcome to Learinal, {{userName}}!</h1>
      <p>We're excited to have you on board.</p>
      <p>Get started by logging in: <a href="{{loginUrl}}">Login Here</a></p>
    `,
    bodyText: "Welcome to Learinal, {{userName}}! Login at: {{loginUrl}}",
    isActive: true,
  },
  {
    templateId: "passwordReset",
    name: "Password Reset",
    subject: "Reset Your Password",
    category: "Auth",
    variables: ["userName", "resetLink", "expiryHours"],
    bodyHtml: `
      <h1>Password Reset Request</h1>
      <p>Hi {{userName}},</p>
      <p>Click the link below to reset your password (expires in {{expiryHours}} hours):</p>
      <p><a href="{{resetLink}}">Reset Password</a></p>
    `,
    bodyText: "Reset your password at: {{resetLink}}",
    isActive: true,
  },
  {
    templateId: "subscriptionActivated",
    name: "Subscription Activated",
    subject: "Your Subscription is Active!",
    category: "Subscription",
    variables: ["userName", "planName", "endDate"],
    bodyHtml: `
      <h1>Subscription Activated</h1>
      <p>Hi {{userName}},</p>
      <p>Your {{planName}} subscription is now active until {{endDate}}.</p>
      <p>Enjoy all the premium features!</p>
    `,
    bodyText: "Your {{planName}} subscription is active until {{endDate}}.",
    isActive: true,
  },
  {
    templateId: "subscriptionExpiring",
    name: "Subscription Expiring Soon",
    subject: "Your Subscription Expires Soon",
    category: "Subscription",
    variables: ["userName", "planName", "endDate", "renewUrl"],
    bodyHtml: `
      <h1>Subscription Expiring</h1>
      <p>Hi {{userName}},</p>
      <p>Your {{planName}} subscription expires on {{endDate}}.</p>
      <p><a href="{{renewUrl}}">Renew Now</a> to continue enjoying premium features.</p>
    `,
    bodyText: "Your subscription expires on {{endDate}}. Renew at: {{renewUrl}}",
    isActive: true,
  },
  {
    templateId: "validationAssigned",
    name: "Validation Request Assigned",
    subject: "New Validation Request Assigned",
    category: "Validation",
    variables: ["expertName", "setTitle", "subjectName", "numQuestions", "reviewLink"],
    bodyHtml: `
      <h1>New Validation Request</h1>
      <p>Hi {{expertName}},</p>
      <p>A new question set requires your review:</p>
      <ul>
        <li>Title: {{setTitle}}</li>
        <li>Subject: {{subjectName}}</li>
        <li>Questions: {{numQuestions}}</li>
      </ul>
      <p><a href="{{reviewLink}}">Start Review</a></p>
    `,
    bodyText: "New validation request: {{setTitle}}. Review at: {{reviewLink}}",
    isActive: true,
  },
  {
    templateId: "validationCompleted",
    name: "Validation Completed",
    subject: "Your Question Set Review is Complete",
    category: "Validation",
    variables: ["learnerName", "setTitle", "decision", "feedback", "setLink"],
    bodyHtml: `
      <h1>Validation Complete</h1>
      <p>Hi {{learnerName}},</p>
      <p>Your question set "{{setTitle}}" has been reviewed.</p>
      <p>Decision: <strong>{{decision}}</strong></p>
      <p>Feedback: {{feedback}}</p>
      <p><a href="{{setLink}}">View Question Set</a></p>
    `,
    bodyText: "Your question set has been reviewed. Decision: {{decision}}",
    isActive: true,
  },
  {
    templateId: "paymentSuccess",
    name: "Payment Successful",
    subject: "Thanh toán thành công - Payment Successful",
    category: "Subscription",
    variables: ["userName", "planName", "amount", "transactionId", "renewalDate"],
    bodyHtml: `
      <h1>Thanh toán thành công!</h1>
      <p>Xin chào {{userName}},</p>
      <p>Chúng tôi đã nhận được thanh toán của bạn thành công.</p>
      <h2>Thông tin thanh toán:</h2>
      <ul>
        <li><strong>Gói dịch vụ:</strong> {{planName}}</li>
        <li><strong>Số tiền:</strong> {{amount}} VND</li>
        <li><strong>Mã giao dịch:</strong> {{transactionId}}</li>
        <li><strong>Ngày gia hạn:</strong> {{renewalDate}}</li>
      </ul>
      <p>Tài khoản của bạn đã được kích hoạt và bạn có thể bắt đầu sử dụng các tính năng premium ngay bây giờ!</p>
      <hr>
      <h1>Payment Successful!</h1>
      <p>Hello {{userName}},</p>
      <p>We have successfully received your payment.</p>
      <h2>Payment Details:</h2>
      <ul>
        <li><strong>Plan:</strong> {{planName}}</li>
        <li><strong>Amount:</strong> {{amount}} VND</li>
        <li><strong>Transaction ID:</strong> {{transactionId}}</li>
        <li><strong>Renewal Date:</strong> {{renewalDate}}</li>
      </ul>
      <p>Your account has been activated and you can start using premium features right now!</p>
    `,
    bodyText:
      "Thanh toán thành công! Gói: {{planName}}, Số tiền: {{amount}} VND, Mã GD: {{transactionId}}. Payment successful! Plan: {{planName}}, Amount: {{amount}} VND, Transaction: {{transactionId}}.",
    isActive: true,
  },
];

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoConfig.uri, mongoConfig.options);
    console.log("Connected to MongoDB");

    console.log("Clearing existing email templates...");
    await EmailTemplate.deleteMany({});

    console.log("Creating email templates...");
    const created = await EmailTemplate.insertMany(templates);

    console.log(`✓ Created ${created.length} email templates:`);
    created.forEach((template) => {
      console.log(`  - ${template.name} (${template.templateId})`);
    });

    console.log("\nSeed completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

seed();
