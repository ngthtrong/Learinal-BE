/**
 * Seed script: Create email templates
 * Run: node scripts/seed-email-templates.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const env = require("../src/config/env");
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
    variables: ["user_name", "plan_name", "amount", "transaction_id", "renewal_date"],
    bodyHtml: `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f7fb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 500px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 30px 40px 20px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <img src="https://learinal.app/logo.png" alt="Learinal" style="height: 32px; width: auto;" />
                    <span style="margin-left: 8px; font-size: 18px; font-weight: 600; color: #4F46E5; vertical-align: middle;">Learinal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #1a1a2e;">Thanh toán thành công</h1>
              <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280;">Xin chào {{user_name}},</p>
              
              <p style="margin: 0 0 24px; font-size: 14px; color: #374151; line-height: 1.6;">
                Chúng tôi đã nhận được thanh toán của bạn thành công. Cảm ơn bạn đã tin tưởng sử dụng dịch vụ Learinal!
              </p>
              
              <!-- Payment Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">
                          <span style="font-size: 13px; color: #6b7280;">Gói dịch vụ</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #1a1a2e;">{{plan_name}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">
                          <span style="font-size: 13px; color: #6b7280;">Số tiền</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #22c55e;">{{amount}} VND</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">
                          <span style="font-size: 13px; color: #6b7280;">Mã giao dịch</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #1a1a2e;">{{transaction_id}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="font-size: 13px; color: #6b7280;">Ngày gia hạn</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #1a1a2e;">{{renewal_date}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                Gói dịch vụ của bạn đã được kích hoạt. Chúc bạn học tập hiệu quả!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                © Learinal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    bodyText:
      "Thanh toán thành công! Xin chào {{user_name}}, chúng tôi đã nhận được thanh toán của bạn. Gói: {{plan_name}}, Số tiền: {{amount}} VND, Mã GD: {{transaction_id}}, Gia hạn: {{renewal_date}}.",
    isActive: true,
  },
  {
    templateId: "addonPurchaseSuccess",
    name: "Addon Purchase Successful",
    subject: "Mua gói bổ sung thành công - Addon Purchase Successful",
    category: "Subscription",
    variables: ["user_name", "package_name", "amount", "transaction_id", "test_generations", "validation_requests", "purchase_date"],
    bodyHtml: `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f7fb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 500px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 30px 40px 20px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <img src="https://learinal.app/logo.png" alt="Learinal" style="height: 32px; width: auto;" />
                    <span style="margin-left: 8px; font-size: 18px; font-weight: 600; color: #4F46E5; vertical-align: middle;">Learinal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #1a1a2e;">Mua gói bổ sung thành công</h1>
              <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280;">Xin chào {{user_name}},</p>
              
              <p style="margin: 0 0 24px; font-size: 14px; color: #374151; line-height: 1.6;">
                Chúng tôi đã nhận được thanh toán của bạn thành công. Gói bổ sung đã được kích hoạt!
              </p>
              
              <!-- Purchase Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">
                          <span style="font-size: 13px; color: #6b7280;">Gói</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #1a1a2e;">{{package_name}}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">
                          <span style="font-size: 13px; color: #6b7280;">Số tiền</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #1a1a2e;">{{amount}} VND</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">
                          <span style="font-size: 13px; color: #6b7280;">Lượt tạo đề</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #22c55e;">+{{test_generations}} lượt</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #dcfce7;">
                          <span style="font-size: 13px; color: #6b7280;">Lượt xác thực</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #22c55e;">+{{validation_requests}} lượt</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="font-size: 13px; color: #6b7280;">Mã giao dịch</span><br>
                          <span style="font-size: 15px; font-weight: 600; color: #1a1a2e;">{{transaction_id}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                Bạn có thể sử dụng ngay các lượt bổ sung này. Chúc bạn học tập hiệu quả!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                © Learinal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    bodyText:
      "Mua gói bổ sung thành công! Xin chào {{user_name}}, gói {{package_name}} đã được kích hoạt. Bạn nhận được +{{test_generations}} lượt tạo đề và +{{validation_requests}} lượt xác thực. Mã GD: {{transaction_id}}.",
    isActive: true,
  },
  {
    templateId: "lowQuotaWarning",
    name: "Low Quota Warning",
    subject: "Cảnh báo: Lượt sử dụng sắp hết - Learinal",
    category: "Subscription",
    variables: ["user_name", "quota_type", "remaining_count", "max_count", "feature_name", "addon_url"],
    bodyHtml: `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f7fb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 500px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <tr>
            <td style="padding: 30px 40px 20px;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <img src="https://learinal.app/logo.png" alt="Learinal" style="height: 32px; width: auto;" />
                    <span style="margin-left: 8px; font-size: 18px; font-weight: 600; color: #4F46E5; vertical-align: middle;">Learinal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          
          <tr>
            <td style="padding: 0 40px 30px;">
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #1a1a2e; text-align: center;">Lượt sử dụng sắp hết!</h1>
              <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280; text-align: center;">Xin chào {{user_name}},</p>
              
              <p style="margin: 0 0 24px; font-size: 14px; color: #374151; line-height: 1.6; text-align: center;">
                Lượt <strong>{{feature_name}}</strong> của bạn sắp hết. Hãy mua thêm gói bổ sung để tiếp tục sử dụng dịch vụ.
              </p>
              
              
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fffbeb; border-radius: 8px; margin-bottom: 24px; border: 1px solid #fcd34d;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0; text-align: center;">
                          <span style="font-size: 13px; color: #92400e;">Lượt còn lại</span><br>
                          <span style="font-size: 32px; font-weight: 700; color: #d97706;">{{remaining_count}}</span>
                          <span style="font-size: 14px; color: #92400e;"> / {{max_count}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6; text-align: center;">
                Gói bổ sung sẽ được kích hoạt ngay sau khi thanh toán thành công.
              </p>
            </td>
          </tr>
          
          
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                © Learinal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    bodyText:
      "Cảnh báo: Lượt sử dụng sắp hết! Xin chào {{user_name}}, lượt {{feature_name}} của bạn còn {{remaining_count}}/{{max_count}}. Mua thêm gói bổ sung tại: {{addon_url}}",
    isActive: true,
  },
];

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
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
