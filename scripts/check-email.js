#!/usr/bin/env node
/**
 * Verifies that enquiry notifications can actually leave the machine.
 * Run with:  npm run check:email
 *
 * Sends one test message to NOTIFY_EMAIL using the SMTP credentials in .env,
 * so a failure here is exactly the failure a real enquiry would hit.
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

const to = process.env.NOTIFY_EMAIL || 'bluejetholidaypune@gmail.com';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

function fail(msg, hint) {
  console.error('\nFAILED: ' + msg);
  if (hint) console.error('\n' + hint);
  process.exit(1);
}

if (!user || !pass || /^your[-_]?/i.test(user) || /^your[-_]?/i.test(pass)) {
  fail(
    'SMTP_USER or SMTP_PASS is missing or still a placeholder in .env',
    'Gmail rejects normal account passwords. Create an App Password:\n' +
    '  Google Account > Security > 2-Step Verification > App passwords\n' +
    'Then put the 16-character value in SMTP_PASS with no spaces.'
  );
}

const port = Number(process.env.SMTP_PORT) || 587;
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port,
  secure: port === 465,
  auth: { user, pass }
});

console.log('Connecting to ' + (process.env.SMTP_HOST || 'smtp.gmail.com') + ':' + port + ' as ' + user + ' ...');

transport.verify()
  .then(() => {
    console.log('Credentials accepted. Sending a test enquiry to ' + to + ' ...');
    return transport.sendMail({
      from: '"Blue Jet Holidays website" <' + user + '>',
      to,
      subject: 'Test enquiry from the website',
      text: [
        'This is a test from npm run check:email.',
        '',
        'If you are reading this in the Blue Jet inbox, website enquiries will',
        'arrive here correctly. Nothing else needs configuring.'
      ].join('\n')
    });
  })
  .then((info) => {
    console.log('\nSent. Message id: ' + info.messageId);
    console.log('Check ' + to + ' (including spam on the first send).');
  })
  .catch((err) => {
    let hint = '';
    if (/Invalid login|Username and Password not accepted|BadCredentials/i.test(err.message)) {
      hint = 'Gmail refused the login. This is almost always a normal password\n' +
             'being used where an App Password is required, or 2-Step\n' +
             'Verification not being enabled on the account yet.';
    } else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(err.message)) {
      hint = 'Could not reach the mail server. Check SMTP_HOST and SMTP_PORT,\n' +
             'and whether outbound port ' + port + ' is blocked on this network.';
    }
    fail(err.message, hint);
  });
