import 'dotenv/config'; // Loads .env into process.env
import lighthouse from 'lighthouse';
import * as ChromeLauncher from 'chrome-launcher';
import { google } from 'googleapis';

/**
 * 1. URLs to test
 */
const URLS_TO_TEST = [
  'https://mex.com.au/',
  'https://mex.com.au/maintenancesoftware/',
];

/**
 * 2. Path to service account JSON
 */
const SERVICE_ACCOUNT_KEY_FILE = "./autolighthousejs.json";

/**
 * 3. Google Sheets config
 */
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SHEET_NAME = 'Results'; // e.g., "Results" tab

/**
 * 4. Lighthouse configs for MOBILE vs DESKTOP
 */
const mobileConfig = {
  logLevel: 'error',
  output: 'json',
  // By default, Lighthouse uses a mobile emulation. 
  // But we can explicitly specify if we want:
  extends: 'lighthouse:default',
  // settings: {
  //   formFactor: 'mobile',
  //   screenEmulation: {
  //     mobile: true,
  //     width: 375,
  //     height: 667,
  //     deviceScaleRatio: 2,
  //     disabled: false
  //   }
  // }
};

const desktopConfig = {
  logLevel: 'error',
  output: 'json',
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleRatio: 1,
      disabled: false
    }
  }
};

/**
 * We create an array of run modes so we can iterate 
 * over "mobile" and "desktop" for each URL
 */
const RUN_MODES = [
  { deviceType: 'Mobile', config: mobileConfig },
  { deviceType: 'Desktop', config: desktopConfig }
];

/**
 * Launch Chrome & run Lighthouse for a given URL + config
 */
async function runLighthouse(url, lhConfig) {
  // Launch headless Chrome
  const chrome = await ChromeLauncher.launch({
    chromeFlags: ['--headless'],
    userDataDir: 'C:\\TempChromeFiles' // or another writable path
  });

  // Merge the config with the dynamic port from Chrome
  const options = { ...lhConfig, port: chrome.port };

  // Run Lighthouse
  const runnerResult = await lighthouse(url, options);
  await chrome.kill();

  return runnerResult.lhr; // The Lighthouse result object
}

/**
 * Append data to Google Sheets
 */
async function appendToGoogleSheets(authClient, rows) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows,
    },
  });
}

async function main() {
  // Auth with Google
  console.log("Accessing Service Account...");
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();

  // We'll store all results in one big array, then append at the end
  const rows = [];

  // A short date string, e.g. "20/02/2025" in en-AU format
  const dateStr = new Date().toLocaleDateString("en-AU");

  for (const url of URLS_TO_TEST) {
    for (const mode of RUN_MODES) {
      const { deviceType, config } = mode;

      console.log(`Running Lighthouse for: ${url} [${deviceType}]`);

      try {
        const lhr = await runLighthouse(url, config);

        // Domain
        const domain = new URL(url).hostname;

        // Keep siteVersion empty for manual entry
        const siteVersion = "";

        // Grab metrics (in ms -> convert to seconds)
        const fcpMs = lhr.audits['first-contentful-paint']?.numericValue;
        const lcpMs = lhr.audits['largest-contentful-paint']?.numericValue;
        const tbtMs = lhr.audits['total-blocking-time']?.numericValue;
        const cls   = lhr.audits['cumulative-layout-shift']?.numericValue;
        const speedIndexMs = lhr.audits['speed-index']?.numericValue;

        // Convert to seconds with 2 decimals
        const fcpSec =  fcpMs ?  (fcpMs / 1000).toFixed(2) : "";
        const lcpSec =  lcpMs ?  (lcpMs / 1000).toFixed(2) : "";
        const tbtSec =  tbtMs ?  (tbtMs / 1000).toFixed(2) : "";
        const speedIndexSec = speedIndexMs ? (speedIndexMs / 1000).toFixed(2) : "";

        // Category scores
        const performance   = lhr.categories.performance?.score;
        const accessibility = lhr.categories.accessibility?.score;
        const bestPractices = lhr.categories['best-practices']?.score;
        const seo           = lhr.categories.seo?.score;

        // The row in the desired order:
        // 1) Date
        // 2) Domain
        // 3) URL
        // 4) Mobile or Desktop
        // 5) Site Version
        // 6) FCP (s)
        // 7) LCP (s)
        // 8) TBT (s)
        // 9) CLS
        // 10) Speed Index (s)
        // 11) Performance Score
        // 12) Accessibility Score
        // 13) Best Practices Score
        // 14) SEO Score
        const row = [
          dateStr,
          domain,
          url,
          deviceType,
          siteVersion,
          fcpSec,
          lcpSec,
          tbtSec,
          cls,
          speedIndexSec,
          performance,
          accessibility,
          bestPractices,
          seo
        ];

        rows.push(row);
      } catch (err) {
        console.error(`Error running Lighthouse for ${url} [${deviceType}]:`, err);
        // If there's an error, push partial data or an error row
        rows.push([
          dateStr,
          "", // domain
          url,
          deviceType,
          "",
          "", "", "", "", "", "", "", "", "",
          `ERROR: ${err.message}`
        ]);
      }
    }
  }

  // Finally append rows if we have any
  if (rows.length > 0) {
    console.log(`Appending ${rows.length} row(s) to Google Sheets...`);
    await appendToGoogleSheets(authClient, rows);
    console.log("Done!");
  } else {
    console.log("No rows to append.");
  }
}

// Run it
main().catch(console.error);
