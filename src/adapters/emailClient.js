const sgMail = require("@sendgrid/mail");
const EmailTemplate = require("../models/emailTemplate.model");

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
        const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
        this.SESClient = SESClient;
        this.SendEmailCommand = SendEmailCommand;
        this.ses = new SESClient({ region: this.config.sesRegion });
      } catch (err) {
        this.sesInitError = err;
      }
    }
  }

  /**
   * Replace template variables with actual values
   * Supports both {{variable}} and {{variable_name}} formats
   */
  replaceVariables(template, variables) {
    if (!template || !variables) return template;
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value != null ? String(value) : '');
    }
    return result;
  }

  /**
   * Get template from database by templateId
   */
  async getTemplateFromDb(templateId) {
    try {
      const template = await EmailTemplate.findOne({ 
        templateId, 
        isActive: true 
      });
      return template;
    } catch (error) {
      const logger = require('../utils/logger');
      logger.error({ templateId, error: error.message }, 'Failed to fetch email template from database');
      return null;
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

  /**
   * Check if a SendGrid template ID is valid (not a placeholder)
   */
  isValidSendGridTemplateId(templateId) {
    if (!templateId || typeof templateId !== 'string') return false;
    // Must start with 'd-' and have valid hex characters (not placeholders like 'x')
    if (!templateId.startsWith('d-')) return false;
    const idPart = templateId.substring(2);
    // Valid SendGrid template IDs have 32 hex characters
    return idPart.length === 32 && /^[a-f0-9]+$/i.test(idPart);
  }

  /**
   * Send email with support for:
   * 1. SendGrid Dynamic Template (if templateId is valid)
   * 2. Database template (if dbTemplateId is provided)
   * 3. Fallback HTML
   */
  async send(to, subject, templateId, variables, options = {}) {
    const from = this.config.fromAddress || "no-reply@learinal.app";
    const { dbTemplateId } = options;

    // Check if we should use database template
    let htmlContent = null;
    let textContent = null;
    let finalSubject = subject;
    
    // Check if SendGrid template ID is valid (not placeholder)
    const usesSendGridTemplate = this.isValidSendGridTemplateId(templateId);

    // If no valid SendGrid templateId, try database template
    if (!usesSendGridTemplate) {
      const dbTemplate = await this.getTemplateFromDb(dbTemplateId || templateId);
      if (dbTemplate) {
        htmlContent = this.replaceVariables(dbTemplate.bodyHtml, variables);
        textContent = this.replaceVariables(dbTemplate.bodyText, variables);
        finalSubject = this.replaceVariables(dbTemplate.subject, variables) || subject;
        templateId = null; // Don't use SendGrid template
      }
    }

    if (this.provider === "sendgrid" && this.config.sendgridApiKey) {
      const msg = {
        to,
        from,
        subject: finalSubject,
      };

      if (usesSendGridTemplate && templateId) {
        // Use SendGrid Dynamic Template (only if valid)
        msg.templateId = templateId;
        msg.dynamicTemplateData = variables || {};
      } else if (htmlContent) {
        // Use database template HTML
        msg.html = htmlContent;
        if (textContent) {
          msg.text = textContent;
        }
      } else {
        // Fallback to basic HTML
        msg.html = this.buildHtml(templateId, variables);
      }
      
      try {
        const response = await sgMail.send(msg);
        // Log successful send with response details
        const logger = require('../utils/logger');
        logger.info({ 
          to, 
          from, 
          subject: finalSubject, 
          templateId,
          dbTemplateId,
          usedDbTemplate: !!htmlContent,
          statusCode: response[0]?.statusCode,
          messageId: response[0]?.headers?.['x-message-id']
        }, 'SendGrid email sent');
        return true;
      } catch (error) {
        const logger = require('../utils/logger');
        logger.error({ 
          to, 
          from, 
          subject: finalSubject, 
          templateId,
          dbTemplateId,
          error: error.message,
          code: error.code,
          response: error.response?.body
        }, 'SendGrid send failed');
        throw error;
      }
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
        } catch {
          throw new Error(
            "SES email provider selected but @aws-sdk/client-ses is not available. Install it or switch provider."
          );
        }
      }
      const html = htmlContent || this.buildHtml(templateId, variables);
      const cmd = new this.SendEmailCommand({
        Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
        Message: {
          Body: { Html: { Charset: "UTF-8", Data: html } },
          Subject: { Charset: "UTF-8", Data: finalSubject },
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
