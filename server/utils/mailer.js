const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendResetEmail = async (toEmail, resetToken) => {
  const resetLink = `${process.env.CLIENT_URL}/pages/auth/set-new-password.html?token=${resetToken}`;
  
  await transporter.sendMail({
    from: '"Pawpaw Clinic Support" <support@pawpaw.clinic>',
    to: toEmail,
    subject: 'Password Reset Request - Pawpaw Clinic',
    html: `
      <h3>Password Reset Request</h3>
      <p>You requested a password reset for your Pawpaw Clinic account.</p>
      <p>Click the link below to set a new password (expires in 15 minutes):</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>If you didn't request this, please ignore this email.</p>
    `
  });
};

module.exports = { sendResetEmail };