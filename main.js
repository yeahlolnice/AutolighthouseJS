import 'dotenv/config';          // Automatically loads .env into process.env
import lighthouse from 'lighthouse';
import chromeLauncher from 'chrome-launcher';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// 1. Hardcode your URLs or fetch them from somewhere else
const URLS_TO_TEST = [
  'https://mex.com.au/',
  'https://mex.com.au/maintenancesoftware/'
];

// 2. Path to your service account JSON file
// Make sure to keep this file private, and .gitignore it if using version control
const SERVICE_ACCOUNT_KEY_FILE = path.join(__dirname, 'autolighthousejs.json');

// 3. Your Google Spreadsheet ID
// You can find this in the sheet's URL: https://docs.google.com/spreadsheets/d/<THIS_PART_IS_THE_ID>/edit
console.log(process.env.GOOGLE_SHEETS_ID);
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;


// OPTIONAL: The sheet/tab name & range for appending. Adjust as needed.
const SHEET_NAME = 'Results'; // or e.g. 'LighthouseData'

// Helper function to run Lighthouse
async function runLighthouse(url) {
  // Launch headless Chrome
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  
  const options = {
    logLevel: 'error',
    output: 'json',
    port: chrome.port,
    // You can set specific throttling or configs here if needed
  };

  const runnerResult = await lighthouse(url, options);
  // runnerResult.lhr is the Lighthouse Result
  await chrome.kill();

  return runnerResult.lhr;
}

// Helper function to append data to Google Sheets
async function appendToGoogleSheets(authClient, rows) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  // The 'range' here is something like 'Sheet1!A1'. Using 'append', we don’t
  // have to specify the exact row, just the top-left corner (A1).
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED', // or 'RAW'
    requestBody: {
      values: rows,
    },
  });
}

async function main() {
  // 1. Auth with Google using a service account
  console.log("Accessing Service Account.")
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();

  // 2. Loop through each URL, run Lighthouse, and build up our data rows
  const now = new Date().toISOString(); // you can format the date/time as you prefer
  
  const rows = [];
  for (const url of URLS_TO_TEST) {
    const fullUrl = url.startsWith('http') ? url : `https://example.com${url}`;
    console.log(`Running Lighthouse for: ${fullUrl}`);

    try {
      const lhr = await runLighthouse(fullUrl);
      // Extract the scores we care about
      const performance = lhr.categories.performance.score;
      const accessibility = lhr.categories.accessibility.score;
      const bestPractices = lhr.categories['best-practices'].score;
      const seo = lhr.categories.seo.score;
      
      // You could also pull in metrics like TTFB, FCP, LCP, etc. from lhr.audits

      // Create a row: [ Date, Relative/Full URL, Perf, Accessibility, Best Practices, SEO ]
      const row = [
        now,
        url, // or fullUrl
        performance,
        accessibility,
        bestPractices,
        seo
      ];
      rows.push(row);
    } catch (error) {
      console.error(`Error running Lighthouse for ${url}:`, error);
      // Optionally, push a row indicating an error
      const row = [now, url, 'ERROR', error.toString()];
      rows.push(row);
    }
  }

  // 3. Append all rows to the Google Sheet
  if (rows.length > 0) {
    console.log(`Appending ${rows.length} row(s) to Google Sheets...`);
    await appendToGoogleSheets(authClient, rows);
    console.log('Done!');
  } else {
    console.log('No rows to append.');
  }
}

// Run the script
main().catch(console.error);
