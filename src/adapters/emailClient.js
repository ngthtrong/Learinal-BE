const sgMail = require("@sendgrid/mail");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

class EmailClient {
  constructor(config) {
    this.config = config || {};
    this.provider = (this.config.provider || "sendgrid").toLowerCase();

    if (this.provider === "sendgrid" && this.config.sendgridApiKey) {
      sgMail.setApiKey(this.config.sendgridApiKey);
    }
    if (this.provider === "ses" && this.config.sesRegion) {
      this.ses = new SESClient({ region: this.config.sesRegion });
    }
  }

  buildHtml(templateId, variables) {
    // Very simple HTML fallback when template not used
    const { fullName, link, message } = variables || {};
    const safe = (s) => (s == null ? "" : String(s));
    return `
      <div>
        <p>Hello ${safe(fullName) || "there"},</p>
        ${
          link
            ? `<p>Please click: <a href="${safe(link)}">${safe(link)}</a></p>`
            : ""
        }
        ${message ? `<p>${safe(message)}</p>` : ""}
        <p>Regards,<br/>Learinal</p>
      </div>
    `;
  }

  async send(to, subject, templateId, variables) {
    const from = this.config.fromAddress || "no-reply@learinal.app";

    if (this.provider === "sendgrid" && this.config.sendgridApiKey) {
      const msg = {
        to,
        from,
        subject,
      };
      if (templateId) {
        msg.templateId = templateId;
        msg.dynamicTemplateData = variables || {};
      } else {
        msg.html = this.buildHtml(templateId, variables);
      }
      await sgMail.send(msg);
      return true;
    }

    if (this.provider === "ses" && this.ses) {
      const html = this.buildHtml(templateId, variables);
      const cmd = new SendEmailCommand({
        Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
        Message: {
          Body: { Html: { Charset: "UTF-8", Data: html } },
          Subject: { Charset: "UTF-8", Data: subject },
        },
        Source: from,
      });
      await this.ses.send(cmd);
      return true;
    }

    // No provider configured; act as no-op
    return false;
  }
}

module.exports = EmailClient;
