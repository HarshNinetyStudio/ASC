require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const path = require('path');

const LOGO_URL = 'https://www.aftersportsconsultancy.com/asc-logo.png';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for the contact endpoint
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many submissions. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Nodemailer transporter (IONOS SMTP)
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

// Verify SMTP connection on startup
transporter.verify()
  .then(() => console.log('SMTP connection verified successfully'))
  .catch((err) => console.error('SMTP connection error:', err));

// Validation rules
const contactValidation = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ max: 100 }).withMessage('First name too long')
    .escape(),
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ max: 100 }).withMessage('Last name too long')
    .escape(),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 30 }).withMessage('Phone number too long')
    .escape(),
  body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ max: 5000 }).withMessage('Message too long')
    .escape()
];

// POST /api/contact
app.post('/api/contact', contactLimiter, contactValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => e.msg)
    });
  }

  const { firstName, lastName, email, phone, message } = req.body;

  try {
    // Send notification email to the business
    await transporter.sendMail({
      from: `"ASC Website" <${process.env.SMTP_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      replyTo: email,
      subject: `New Contact Form Submission from ${firstName} ${lastName}`,
      html: buildNotificationEmail({ firstName, lastName, email, phone, message })
    });

    // Send auto-reply to the submitter
    await transporter.sendMail({
      from: `"After Sports Consultancy" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Thanks for contacting us - After Sports Consultancy',
      html: buildAutoReplyEmail(firstName)
    });

    return res.json({
      success: true,
      message: 'Your message has been sent successfully.'
    });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send your message. Please try again later.'
    });
  }
});

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

// Serve static files
app.use(express.static(path.join(__dirname), {
  index: 'index.html'
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
