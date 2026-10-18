const nodemailer = require('nodemailer');
const env = require('../config/env');

// Tried in order; the first one that succeeds wins. SMTP (nodemailer) is the default.
const PROVIDERS = ['smtp', 'resend', 'sendgrid', 'brevo'];

const ready = (provider) => {
  if (provider === 'smtp') return Boolean(env.smtpHost && env.mailFrom);
  if (provider === 'resend') return Boolean(env.resendApiKey);
  if (provider === 'sendgrid') return Boolean(env.sendgridApiKey);
  if (provider === 'brevo') return Boolean(env.brevoApiKey);
  return false;
};

// EMAIL_PROVIDER pins a single provider; otherwise every configured provider is tried in order.
const providerChain = () => (env.emailProvider ? [env.emailProvider] : PROVIDERS).filter(ready);

const isConfigured = () => providerChain().length > 0;

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined
    });
  }
  return transporter;
};

const parseFrom = (value) => {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value || '');
  if (match) return { name: match[1] || undefined, email: match[2] };
  return { email: (value || '').trim() };
};

const postJson = async (url, headers, body) => {
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${detail.slice(0, 200)}`);
  }
};

// HTTP mail APIs keep working on hosts that block outbound SMTP (e.g. Render).
const sendHttp = async (provider, { to, subject, text, html }) => {
  const from = parseFrom(env.mailFrom || env.smtpUser);
  if (provider === 'resend') {
    return postJson(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
      { from: env.mailFrom || from.email, to: [to], subject, text, html }
    );
  }
  if (provider === 'sendgrid') {
    return postJson(
      'https://api.sendgrid.com/v3/mail/send',
      { Authorization: `Bearer ${env.sendgridApiKey}`, 'Content-Type': 'application/json' },
      {
        personalizations: [{ to: [{ email: to }] }],
        from,
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      }
    );
  }
  if (provider === 'brevo') {
    return postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': env.brevoApiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      { sender: from, to: [{ email: to }], subject, textContent: text, htmlContent: html }
    );
  }
  throw new Error(`Unsupported provider "${provider}"`);
};

const verificationLink = (rawToken) =>
  `${env.serverUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const button = (link) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Sign in to Face Attendance</a></p>`;

const wrap = (title, inner) =>
  `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;color:#111">
     <h2 style="font-size:18px">${escapeHtml(title)}</h2>
     ${inner}
     <p style="color:#6b7280;font-size:12px">This link expires in ${env.emailLinkTtlMinutes} minutes and can only be used once. If you did not request it, you can ignore this email.</p>
   </div>`;

const sendViaProvider = async (provider, message) => {
  if (provider === 'smtp') {
    await getTransporter().sendMail({ from: env.mailFrom, ...message });
    return;
  }
  await sendHttp(provider, message);
};

const send = async (message) => {
  const chain = providerChain();
  if (chain.length === 0) {
    console.warn(`[email] No email provider configured; "${message.subject}" for ${message.to} was not sent.`);
    return false;
  }
  for (const provider of chain) {
    try {
      await sendViaProvider(provider, message);
      return true;
    } catch (error) {
      console.error(`[email] ${provider} failed for "${message.subject}" to ${message.to}: ${error.message}`);
    }
  }
  // A mail failure must never block account provisioning; the admin still has the link to share by hand.
  console.error(`[email] All providers failed for "${message.subject}" to ${message.to}.`);
  return false;
};

// Admin provisions a professor: hand over both a temporary password and a one-time sign-in link.
const sendProfessorInvite = async ({ to, name, link, password }) => {
  const subject = 'Your IIIT Indore attendance account';
  const text = [
    `Hello ${name || ''},`.trim(),
    '',
    'An account has been created for you on Face Attendance.',
    '',
    `Sign in with this link: ${link}`,
    '',
    `Or use your email and this temporary password: ${password}`,
    '',
    'Change the password after signing in.'
  ].join('\n');
  const html = wrap(
    'Welcome to Face Attendance',
    `<p>Hello ${escapeHtml(name) || ''},</p>
     <p>An account has been created for you. Use the button below to sign in, or sign in with your email and this temporary password:</p>
     <p style="font-family:monospace;font-size:16px"><b>${escapeHtml(password)}</b></p>
     ${button(link)}`
  );
  return send({ to, subject, text, html });
};

// A professor asked to sign in: send a fresh one-time link.
const sendMagicLink = async ({ to, name, link }) => {
  const subject = 'Your Face Attendance sign-in link';
  const text = [
    `Hello ${name || ''},`.trim(),
    '',
    'Use this one-time link to sign in:',
    link
  ].join('\n');
  const html = wrap(
    'Your sign-in link',
    `<p>Hello ${escapeHtml(name) || ''},</p><p>Use the button below to sign in.</p>${button(link)}`
  );
  return send({ to, subject, text, html });
};

module.exports = { isConfigured, verificationLink, sendProfessorInvite, sendMagicLink };
