import 'dotenv/config'; // Loads .env into process.env
import lighthouse from 'lighthouse';
import * as ChromeLauncher from 'chrome-launcher';
import { google } from 'googleapis';
import * as fs from 'fs';

// 1. Read URLs From Text File
const URLS_TO_TEST = fs.readFileSync('URLs.txt').toString('UTF8').split('\n');


// 2. Path to service account JSON
const SERVICE_ACCOUNT_KEY_FILE = "./autolighthousejs.json";


// 3. Google Sheets config
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SHEET_NAME = 'Results'; // e.g., "Results" tab


// 4. Lighthouse configs for MOBILE vs DESKTOP
// Both match the Chrome DevTools Lighthouse presets exactly

// Moto G Power emulation, Slow 4G, 4x CPU slowdown
const mobileConfig = {
  logLevel: 'error',
  output: 'json',
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false
    },
    throttlingMethod: 'simulate',
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.56,
      uploadThroughputKbps: 675,
      cpuSlowdownMultiplier: 4
    },
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
  }
};

// 1350x940 viewport, no CPU/network throttling — matches DevTools desktop preset
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
      deviceScaleFactor: 1,
      disabled: false
    },
    throttlingMethod: 'provided',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
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
    chromeFlags: [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-extensions',
    ],
    userDataDir: false,
  });

  const options = { ...lhConfig, port: chrome.port };

  try {
    const runnerResult = await lighthouse(url, options);
    return runnerResult.lhr;
  } catch (err) {
    console.error(`Lighthouse failed on ${url}:`, err);
    return null; // Return null on failure, we'll handle it in the caller
  } finally {
    await chrome.kill();
  }
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

  // Start Chrome debugging mode
  // console.log("Starting Chrome in remote debugging mode...");
  // await startChrome();

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

        if (!lhr) {
          rows.push([dateStr, "", url, deviceType, "", "", "", "", "", "", "", "", "", "", "ERROR: Lighthouse returned no result"]);
          continue;
        }

        // Domain
        const domain = new URL(url).hostname;

        // Keep siteVersion empty for manual entry
        const siteVersion = "";

        const fcpMs       = lhr.audits['first-contentful-paint']?.numericValue;
        const lcpMs       = lhr.audits['largest-contentful-paint']?.numericValue;
        const tbtMs       = lhr.audits['total-blocking-time']?.numericValue;
        const cls         = lhr.audits['cumulative-layout-shift']?.numericValue.toFixed(3);
        const speedIndexMs = lhr.audits['speed-index']?.numericValue;

        const fcpSec       = fcpMs        ? (fcpMs / 1000).toFixed(2)        : "";
        const lcpSec       = lcpMs        ? (lcpMs / 1000).toFixed(2)        : "";
        const tbtRounded   = tbtMs        ? Math.round(tbtMs)                 : ""; // stays in ms
        const speedIndexSec = speedIndexMs ? (speedIndexMs / 1000).toFixed(2) : "";

        // Category scores
        const performance = lhr.categories.performance?.score ? lhr.categories.performance.score * 100 : "";
        const accessibility = lhr.categories.accessibility?.score ? lhr.categories.accessibility.score * 100 : "";
        const bestPractices = lhr.categories['best-practices']?.score ? lhr.categories['best-practices'].score * 100 : "";
        const seo = lhr.categories.seo?.score ? lhr.categories.seo.score * 100 : "";


        // The row in the desired order:
        // 1) Date
        // 2) Domain
        // 3) URL
        // 4) Mobile or Desktop
        // 5) Site Version
        // 6) FCP (s)
        // 7) LCP (s)
        // 8) TBT (ms)
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
          tbtRounded,
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
