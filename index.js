import 'dotenv/config';
import nodemailer from 'nodemailer';
import checkPort from 'is-port-reachable';
import fs from 'fs';
import path from 'path';
import Pushover from 'pushover-notifications';

global.__dirname = process.cwd(); // polyfill for es6

const host = process.env.HOST;
const port = process.env.PORT;
const pushoverPriority = parseInt(process.env.PUSHOVER_PRIORITY) || 0;
const dbPath = path.join(__dirname, 'state.db');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: { rejectUnauthorized: false }, // do not fail on invalid certs
});

const pushover = new Pushover({
  user: process.env.PUSHOVER_USER,
  token: process.env.PUSHOVER_TOKEN,
})

if (!fs.existsSync(dbPath)) {
  console.log(`${getDateTime()}: creating new file: state.db`)
  fs.writeFileSync(dbPath, '0', { encoding: 'utf8'});
}

// -------------------------------------------------------------------------- //

function loadCounter() {
  const str = fs.readFileSync(dbPath, { encoding: 'utf8', flag: 'r' });
  return parseInt(str);
}

function saveCounter(int) {
  const str = int.toString();
  fs.writeFileSync(dbPath, str, { encoding: 'utf8'});
}

function sendEmail(content) {
  return new Promise((resolve, reject) => {
    console.log(`${getDateTime()}: Sending Email`);
    transporter.sendMail(content, (error, info) => {
      if (error) {
        console.log(`${getDateTime()}: sendEmail error: ${error}`);
        return reject(error);
      }

      console.log(`${getDateTime()}: Email sent: ${info.response}`);
      resolve(info.response);
    });
  })
}

function getDate() {
  const date = new Date();
  const today = `${date.getMonth()}/${date.getDate()}/${date.getFullYear()}`;
  return today;
}

function getDateTime() {
  return new Date().toLocaleString();
}

async function main() {
  let counter = loadCounter();
  const isReachable = await checkPort(port, { host });

  if (isReachable) {
    if (counter !== 0) saveCounter(0);
    return;
  }

  console.log(`${getDateTime()}: ${host} is down. incrementing counter.`, counter, '->', counter + 1);
  counter += 1;
  saveCounter(counter);
  
  // configured for running at 5 minute cron intervals
  // if down for 1 hour. and every 6 hours thereafter
  if (counter === 12 || counter % 72 === 60) {
    const offlineFor = counter * 5;
    const subject = `⚡ Lightning Node Offline 🛑 (${getDate()})`;
    const text = `Server has been offline for ${offlineFor} minutes.`;

    sendEmail({
      from: process.env.EMAIL_USERNAME,
      to: process.env.TO_EMAIL_ADDRESS,
      subject,
      text,
    });

    pushover.send({
      title: subject,
      message: text,	// required
      priority: pushoverPriority,
    });
  }
}

main();
