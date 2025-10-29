const sgMail = require("@sendgrid/mail");

class EmailClient {
  constructor(config) {
    this.config = config || {};
    this.provider = (this.config.provider || "sendgrid").toLowerCase();

    if (this.provider === "sendgrid" && this.config.sendgridApiKey) {
      sgMail.setApiKey(this.config.sendgridApiKey);
    }
    if (this.provider === "ses" && this.config.sesRegion) {
      // Lazy-load AWS SES only if chosen, so project can run without the package installed
      try {
        // eslint-disable-next-line global-require
        const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
        this.SESClient = SESClient;
        this.SendEmailCommand = SendEmailCommand;
        this.ses = new SESClient({ region: this.config.sesRegion });
      } catch (err) {
        this.sesInitError = err;
      }
    }
  }

  buildHtml(templateId, variables) {
    // Very simple HTML fallback when template not used
    const { fullName, link, message } = variables || {};
    const safe = (s) => (s == null ? "" : String(s));
    return `
      <div>
        <p>Hello ${safe(fullName) || "there"},</p>
        ${link ? `<p>Please click: <a href="${safe(link)}">${safe(link)}</a></p>` : ""}
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

    if (this.provider === "ses") {
      if (this.sesInitError) {
        throw new Error(
          "SES email provider selected but @aws-sdk/client-ses is not installed. Install it or switch EMAIL_PROVIDER=sendgrid."
        );
      }
      if (!this.ses || !this.SendEmailCommand) {
        // Defensive: try to init again in case constructor path was skipped
        try {
          const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
          this.SESClient = this.SESClient || SESClient;
          this.SendEmailCommand = this.SendEmailCommand || SendEmailCommand;
          this.ses = this.ses || new SESClient({ region: this.config.sesRegion });
        } catch (err) {
          throw new Error(
            "SES email provider selected but @aws-sdk/client-ses is not available. Install it or switch provider."
          );
        }
      }
      const html = this.buildHtml(templateId, variables);
      const cmd = new this.SendEmailCommand({
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
