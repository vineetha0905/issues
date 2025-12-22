const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Only create transporter if SMTP config is available
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      console.warn('Email service not configured - SMTP settings missing');
      this.transporter = null;
    }
  }

  // Send OTP email
  async sendOTP(email, otp, name = 'User') {
    // Check if email configuration is available
    if (!this.transporter || !process.env.FROM_EMAIL) {
      console.warn('Email service not configured - skipping OTP email');
      return { success: false, error: 'Email service not configured' };
    }

    const mailOptions = {
      from: `${process.env.FROM_NAME || 'CivicConnect'} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: 'Your OTP for CivicConnect',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 2rem;">CivicConnect</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Your OTP is ready</p>
          </div>
          
          <div style="padding: 2rem; background: #f8fafc;">
            <h2 style="color: #1e293b; margin-bottom: 1rem;">Hello ${name}!</h2>
            <p style="color: #64748b; line-height: 1.6; margin-bottom: 1.5rem;">
              You requested an OTP to verify your account. Use the following code to complete your verification:
            </p>
            
            <div style="background: white; padding: 1.5rem; border-radius: 8px; text-align: center; border: 2px solid #e2e8f0;">
              <h3 style="color: #667eea; font-size: 2rem; margin: 0; letter-spacing: 0.5rem;">${otp}</h3>
            </div>
            
            <p style="color: #64748b; font-size: 0.9rem; margin-top: 1.5rem;">
              This OTP will expire in 5 minutes. If you didn't request this, please ignore this email.
            </p>
          </div>
          
          <div style="background: #1e293b; padding: 1rem; text-align: center; color: white; font-size: 0.8rem;">
            <p style="margin: 0;">© 2024 CivicConnect. All rights reserved.</p>
          </div>
        </div>
      `
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('OTP email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending OTP email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send welcome email
  async sendWelcome(email, name) {
    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: 'Welcome to CivicConnect!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 2rem;">Welcome to CivicConnect!</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Your account has been created successfully</p>
          </div>
          
          <div style="padding: 2rem; background: #f8fafc;">
            <h2 style="color: #1e293b; margin-bottom: 1rem;">Hello ${name}!</h2>
            <p style="color: #64748b; line-height: 1.6; margin-bottom: 1.5rem;">
              Welcome to CivicConnect! You can now report civic issues in your community and track their resolution.
            </p>
            
            <div style="background: white; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #667eea;">
              <h3 style="color: #1e293b; margin-top: 0;">What you can do:</h3>
              <ul style="color: #64748b; line-height: 1.8;">
                <li>Report civic issues with photos and location</li>
                <li>Track the progress of your reports</li>
                <li>Support other community issues</li>
                <li>Receive updates on issue resolution</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 2rem 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
                 style="background: #667eea; color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 8px; display: inline-block;">
                Get Started
              </a>
            </div>
          </div>
          
          <div style="background: #1e293b; padding: 1rem; text-align: center; color: white; font-size: 0.8rem;">
            <p style="margin: 0;">© 2024 CivicConnect. All rights reserved.</p>
          </div>
        </div>
      `
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send issue status update email
  async sendIssueUpdate(email, name, issueTitle, status, issueId) {
    const statusMessages = {
      'reported': 'Your issue has been reported and is under review',
      'in-progress': 'Your issue is now being worked on',
      'resolved': 'Great news! Your issue has been resolved',
      'closed': 'Your issue has been closed'
    };

    const statusColors = {
      'reported': '#f59e0b',
      'in-progress': '#3b82f6',
      'resolved': '#10b981',
      'closed': '#6b7280'
    };

    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: `Issue Update: ${issueTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 2rem;">Issue Update</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Status change notification</p>
          </div>
          
          <div style="padding: 2rem; background: #f8fafc;">
            <h2 style="color: #1e293b; margin-bottom: 1rem;">Hello ${name}!</h2>
            <p style="color: #64748b; line-height: 1.6; margin-bottom: 1.5rem;">
              ${statusMessages[status] || 'Your issue status has been updated'}.
            </p>
            
            <div style="background: white; padding: 1.5rem; border-radius: 8px; border-left: 4px solid ${statusColors[status] || '#667eea'};">
              <h3 style="color: #1e293b; margin-top: 0;">${issueTitle}</h3>
              <p style="color: #64748b; margin-bottom: 1rem;">Status: <strong style="color: ${statusColors[status] || '#667eea'};">${status.replace('-', ' ').toUpperCase()}</strong></p>
              <p style="color: #94a3b8; font-size: 0.9rem;">Issue ID: ${issueId}</p>
            </div>
            
            <div style="text-align: center; margin: 2rem 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/issue/${issueId}" 
                 style="background: #667eea; color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 8px; display: inline-block;">
                View Issue
              </a>
            </div>
          </div>
          
          <div style="background: #1e293b; padding: 1rem; text-align: center; color: white; font-size: 0.8rem;">
            <p style="margin: 0;">© 2024 CivicConnect. All rights reserved.</p>
          </div>
        </div>
      `
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Issue update email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending issue update email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send comment notification email
  async sendCommentNotification(email, name, issueTitle, commentAuthor, commentContent, issueId) {
    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: `New Comment on: ${issueTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 2rem;">New Comment</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Someone commented on your issue</p>
          </div>
          
          <div style="padding: 2rem; background: #f8fafc;">
            <h2 style="color: #1e293b; margin-bottom: 1rem;">Hello ${name}!</h2>
            <p style="color: #64748b; line-height: 1.6; margin-bottom: 1.5rem;">
              <strong>${commentAuthor}</strong> commented on your issue.
            </p>
            
            <div style="background: white; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #667eea;">
              <h3 style="color: #1e293b; margin-top: 0;">${issueTitle}</h3>
              <div style="background: #f8fafc; padding: 1rem; border-radius: 6px; margin: 1rem 0;">
                <p style="color: #64748b; margin: 0; font-style: italic;">"${commentContent}"</p>
                <p style="color: #94a3b8; font-size: 0.9rem; margin: 0.5rem 0 0 0;">- ${commentAuthor}</p>
              </div>
            </div>
            
            <div style="text-align: center; margin: 2rem 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/issue/${issueId}" 
                 style="background: #667eea; color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 8px; display: inline-block;">
                View Comment
              </a>
            </div>
          </div>
          
          <div style="background: #1e293b; padding: 1rem; text-align: center; color: white; font-size: 0.8rem;">
            <p style="margin: 0;">© 2024 CivicConnect. All rights reserved.</p>
          </div>
        </div>
      `
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Comment notification email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending comment notification email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send admin notification email
  async sendAdminNotification(email, name, issueTitle, issueId, reporterName) {
    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: `New Issue Reported: ${issueTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 2rem;">New Issue Reported</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Action required</p>
          </div>
          
          <div style="padding: 2rem; background: #f8fafc;">
            <h2 style="color: #1e293b; margin-bottom: 1rem;">Hello ${name}!</h2>
            <p style="color: #64748b; line-height: 1.6; margin-bottom: 1.5rem;">
              A new issue has been reported and requires your attention.
            </p>
            
            <div style="background: white; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #f59e0b;">
              <h3 style="color: #1e293b; margin-top: 0;">${issueTitle}</h3>
              <p style="color: #64748b; margin-bottom: 1rem;">Reported by: <strong>${reporterName}</strong></p>
              <p style="color: #94a3b8; font-size: 0.9rem;">Issue ID: ${issueId}</p>
            </div>
            
            <div style="text-align: center; margin: 2rem 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin" 
                 style="background: #f59e0b; color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 8px; display: inline-block;">
                Review Issue
              </a>
            </div>
          </div>
          
          <div style="background: #1e293b; padding: 1rem; text-align: center; color: white; font-size: 0.8rem;">
            <p style="margin: 0;">© 2024 CivicConnect. All rights reserved.</p>
          </div>
        </div>
      `
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Admin notification email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending admin notification email:', error);
      return { success: false, error: error.message };
    }
  }

  // Test email configuration
  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('Email service is ready');
      return { success: true };
    } catch (error) {
      console.error('Email service connection failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
