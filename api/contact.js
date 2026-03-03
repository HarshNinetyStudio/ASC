const nodemailer = require('nodemailer');

const LOGO_URL = 'https://raw.githubusercontent.com/HarshNinetyStudio/ASC/main/asc-logo.png';

// Simple validation helper
function validateBody(body) {
  const errors = [];
  if (!body.firstName || !body.firstName.trim()) errors.push('First name is required');
  if (!body.lastName || !body.lastName.trim()) errors.push('Last name is required');
  if (!body.email || !body.email.trim()) errors.push('Email is required');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.push('Invalid email address');
  if (!body.message || !body.message.trim()) errors.push('Message is required');
  if (body.firstName && body.firstName.length > 100) errors.push('First name too long');
  if (body.lastName && body.lastName.length > 100) errors.push('Last name too long');
  if (body.message && body.message.length > 5000) errors.push('Message too long');
  if (body.phone && body.phone.length > 30) errors.push('Phone number too long');
  return errors;
}

// Simple HTML escape
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function buildNotificationEmail({ firstName, lastName, email, phone, message }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #000000; padding: 20px; text-align: center;">
        <img src="${LOGO_URL}" alt="ASC" style="height: 90px; margin-bottom: 8px;" />
        <h1 style="color: #ffffff; margin: 0; font-size: 18px;">New Contact Form Submission</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; width: 140px;">Name:</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${firstName} ${lastName}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;"><a href="mailto:${email}">${email}</a></td>
          </tr>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">Phone:</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${phone || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 12px; font-weight: bold; vertical-align: top;">Message:</td>
            <td style="padding: 12px;">${message.replace(/\n/g, '<br>')}</td>
          </tr>
        </table>
      </div>
      <div style="padding: 15px; text-align: center; color: #888; font-size: 12px;">
        Submitted via aftersportsconsultancy.com contact form
      </div>
    </div>
  `;
}

function buildAutoReplyEmail(firstName) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #000000; padding: 20px; text-align: center;">
        <img src="${LOGO_URL}" alt="ASC" style="height: 90px;" />
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <h2 style="color: #333; margin-top: 0;">Thanks for contacting us!</h2>
        <p style="color: #555; line-height: 1.6;">
          Dear ${firstName},
        </p>
        <p style="color: #555; line-height: 1.6;">
          Thank you for reaching out to After Sports Consultancy. We have received your message
          and a member of our team will get back to you as soon as possible.
        </p>
        <p style="color: #555; line-height: 1.6;">
          Kind regards,<br>
          <strong>The ASC Team</strong>
        </p>
      </div>
      <div style="padding: 15px; text-align: center; color: #888; font-size: 12px;">
        2nd Floor, Berkeley Square House, Berkeley Square, London, W1J 6BD<br>
        <a href="https://www.aftersportsconsultancy.com" style="color: #3998eb;">www.aftersportsconsultancy.com</a>
      </div>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  // CORS headers (must be set before any return)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const body = req.body;

  // Validate
  const errors = validateBody(body);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }

  const firstName = esc(body.firstName.trim());
  const lastName = esc(body.lastName.trim());
  const email = body.email.trim().toLowerCase();
  const phone = esc((body.phone || '').trim());
  const message = esc(body.message.trim());

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: true
    }
  });

  try {
    // Send notification email to business
    await transporter.sendMail({
      from: `"ASC Website" <${process.env.SMTP_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      replyTo: email,
      subject: `New Contact Form Submission from ${firstName} ${lastName}`,
      html: buildNotificationEmail({ firstName, lastName, email, phone, message })
    });

    // Send auto-reply to submitter
    await transporter.sendMail({
      from: `"After Sports Consultancy" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thanks for contacting us - After Sports Consultancy',
      html: buildAutoReplyEmail(firstName)
    });

    return res.status(200).json({ success: true, message: 'Your message has been sent successfully.' });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send your message. Please try again later.' });
  }
};
