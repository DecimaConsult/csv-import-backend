import sgMail from '@sendgrid/mail';

class EmailService {
  constructor() {
    this.initialized = false;
    this.enabled = false;
  }

  // Initialize on first use, not at import time
  _ensureInitialized() {
    if (this.initialized) return;
    
    console.log('📧 Initializing email service...');
    
    // Initialize SendGrid
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      this.enabled = true;
      this.from = process.env.EMAIL_FROM || 'noreply@example.com';
      this.replyTo = process.env.EMAIL_REPLY_TO || this.from;
      this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      console.log('✅ Email service initialized successfully');
      console.log('   From:', this.from);
      console.log('   Reply-To:', this.replyTo);
    } else {
      console.warn('⚠️  SendGrid API key not found. Email service disabled.');
      this.enabled = false;
    }
    
    this.initialized = true;
  }

  /**
   * Send password setup email to new guide
   */
  async sendPasswordSetupEmail(userEmail, userName, setupToken, role = 'GUIDE') {
    this._ensureInitialized();
    
    if (!this.enabled) {
      console.log('📧 Email service disabled - would send password setup to:', userEmail);
      return { success: false, error: 'Email service not configured' };
    }

    const setupUrl = `${this.frontendUrl}/setup-password?token=${setupToken}`;
    const roleTitle = role === 'COORDINATOR' ? 'Coordinator' : role === 'STAFF' ? 'Staff' : 'Guide';
    
    const msg = {
      to: userEmail,
      from: this.from,
      replyTo: this.replyTo,
      subject: `Welcome! Set up your ${roleTitle.toLowerCase()} account`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; overflow: hidden; border: 1px solid #e5e5e5;">
                  <tr>
                    <td style="background-color: #ffffff; padding: 40px 30px; border-bottom: 1px solid #e5e5e5;">
                      <h1 style="color: #1a1a1a; margin: 0; font-size: 24px; font-weight: 600;">Welcome to the Team!</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #333; margin-top: 0; font-size: 18px;">Hi ${userName},</h2>
                      <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Your ${roleTitle.toLowerCase()} account has been created! We're excited to have you on board.
                      </p>
                      <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Click the button below to set your password and get started:
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${setupUrl}" 
                               style="display: inline-block; background-color: #1a1a1a; 
                                      color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; 
                                      font-weight: 500; font-size: 16px;">
                              Set Up My Account
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="color: #999; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="background: #f9f9f9; padding: 12px; border-radius: 4px; word-break: break-all; 
                                font-size: 13px; color: #666; font-family: monospace;">
                        ${setupUrl}
                      </p>
                      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                        ⏰ This link expires in 24 hours for security reasons.
                      </p>
                      <p style="color: #999; font-size: 14px; line-height: 1.6;">
                        If you didn't expect this email, please ignore it.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #f9f9f9; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
                      <p style="color: #999; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} Tour Management. All rights reserved.
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
      text: `
Welcome to the team, ${userName}!

Your ${roleTitle.toLowerCase()} account has been created. Set your password by visiting:
${setupUrl}

This link expires in 24 hours.

If you didn't expect this email, please ignore it.
      `
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Password setup email sent to ${roleTitle}:`, userEmail);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to send password setup email:', error);
      if (error.response) {
        console.error('SendGrid error details:');
        console.error('  Status:', error.response.statusCode);
        console.error('  Body:', JSON.stringify(error.response.body, null, 2));
        
        // Check for common errors
        if (error.response.body?.errors) {
          error.response.body.errors.forEach(err => {
            if (err.message.includes('does not match a verified Sender Identity')) {
              console.error('\n🔧 FIX NEEDED: Verify your sender email in SendGrid');
              console.error('   Go to: https://app.sendgrid.com/settings/sender_auth/senders');
              console.error('   Verify:', this.from);
            }
          });
        }
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(userEmail, userName, resetToken) {
    this._ensureInitialized();
    
    if (!this.enabled) {
      console.log('📧 Email service disabled - would send password reset to:', userEmail);
      return { success: false, error: 'Email service not configured' };
    }

    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    
    const msg = {
      to: userEmail,
      from: this.from,
      replyTo: this.replyTo,
      subject: 'Reset your password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
                      <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Hi ${userName},
                      </p>
                      <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        We received a request to reset your password. Click the button below to create a new password:
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${resetUrl}" 
                               style="display: inline-block; background: #4F46E5; color: white; 
                                      padding: 16px 40px; text-decoration: none; border-radius: 6px; 
                                      font-weight: bold; font-size: 16px;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="color: #999; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link:
                      </p>
                      <p style="background: #f9f9f9; padding: 12px; border-radius: 4px; word-break: break-all; 
                                font-size: 13px; color: #666; font-family: monospace;">
                        ${resetUrl}
                      </p>
                      <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                        ⏰ This link expires in 1 hour.
                      </p>
                      <p style="color: #999; font-size: 14px; line-height: 1.6;">
                        If you didn't request this, please ignore this email. Your password won't change.
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
      text: `
Password Reset Request

Hi ${userName},

We received a request to reset your password. Visit this link to create a new password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email.
      `
    };

    try {
      await sgMail.send(msg);
      console.log('✅ Password reset email sent to:', userEmail);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      if (error.response) {
        console.error('SendGrid error:', error.response.body);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Send tour assignment notification
   */
  async sendTourAssignmentEmail(guideEmail, guideName, tourDetails) {
    this._ensureInitialized();
    
    if (!this.enabled) {
      console.log('📧 Email service disabled - would send tour assignment to:', guideEmail);
      return { success: false, error: 'Email service not configured' };
    }

    // Format date/time for subject (nickname - date and time)
    const startDate = new Date(tourDetails.startTime || tourDetails.date);
    const timezone = process.env.TIMEZONE || 'Europe/Paris';
    const formattedDateTime = startDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    });
    
    const emailSubject = `${tourDetails.nickname || tourDetails.tourName} - ${formattedDateTime}`;

    const msg = {
      to: guideEmail,
      from: this.from,
      replyTo: this.replyTo,
      subject: emailSubject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #333; margin-top: 0;">🎉 New Tour Assignment</h2>
                      <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Hi ${guideName},
                      </p>
                      <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        You've been assigned to a new tour!
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <tr>
                          <td style="padding: 24px;">
                            <h3 style="color: #111827; margin: 0 0 16px 0; font-size: 20px;">
                              ${emailSubject}
                            </h3>
                          </td>
                        </tr>
                      </table>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${this.frontendUrl}/dashboard" 
                               style="display: inline-block; background: #4F46E5; color: white; 
                                      padding: 16px 40px; text-decoration: none; border-radius: 6px; 
                                      font-weight: bold; font-size: 16px;">
                              View Tour Details
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="color: #999; font-size: 14px; line-height: 1.6;">
                        Log in to your account to see passenger details and manage check-ins.
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
      text: `
New Tour Assignment

Hi ${guideName},

You've been assigned to a new tour:

${emailSubject}

View details: ${this.frontendUrl}/dashboard
      `
    };

    try {
      await sgMail.send(msg);
      console.log('✅ Tour assignment email sent to:', guideEmail);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to send tour assignment email:', error);
      if (error.response) {
        console.error('SendGrid error:', error.response.body);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(toEmail) {
    this._ensureInitialized();
    
    if (!this.enabled) {
      return { success: false, error: 'Email service not configured' };
    }

    const msg = {
      to: toEmail,
      from: this.from,
      replyTo: this.replyTo,
      subject: 'Test Email - Tour Management System',
      html: '<h1>✅ Success!</h1><p>Your SendGrid email service is working correctly.</p>',
      text: 'Success! Your SendGrid email service is working correctly.'
    };

    try {
      await sgMail.send(msg);
      console.log('✅ Test email sent to:', toEmail);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to send test email:', error);
      if (error.response) {
        console.error('SendGrid error:', error.response.body);
      }
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const emailService = new EmailService();
export default emailService;
