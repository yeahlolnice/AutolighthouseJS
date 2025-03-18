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
const mobileConfig = {
  logLevel: 'error',
  output: 'json',
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      disabled: false
    },
    throttling: {
      rttMs: 0, // No artificial latency
      throughputKbps: 0, // No artificial bandwidth limits
      cpuSlowdownMultiplier: 1 // No CPU throttling
    }
  }
};

const desktopConfig = {
  logLevel: 'error',
  output: 'json',
  extends: 'lighthouse:default',
  settings: {
    "output": "json",
    "maxWaitForFcp": 30000,
    "maxWaitForLoad": 45000,
    "pauseAfterFcpMs": 1000,
    "pauseAfterLoadMs": 1000,
    "networkQuietThresholdMs": 1000,
    "cpuQuietThresholdMs": 1000,
    "formFactor": "desktop",
    "throttling": {
      "rttMs": 40,
      "throughputKbps": 10240,
      "requestLatencyMs": 0,
      "downloadThroughputKbps": 0,
      "uploadThroughputKbps": 0,
      "cpuSlowdownMultiplier": 1
    },
    "throttlingMethod": "simulate",
    "screenEmulation": {
      "mobile": true,
      "width": 412,
      "height": 823,
      "deviceScaleFactor": 1.75,
      "disabled": true
    },
    "emulatedUserAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "auditMode": false,
    "gatherMode": false,
    "clearStorageTypes": [
      "file_systems",
      "shader_cache",
      "service_workers",
      "cache_storage"
    ],
    "disableStorageReset": false,
    "debugNavigation": false,
    "channel": "devtools",
    "usePassiveGathering": false,
    "disableFullPageScreenshot": false,
    "skipAboutBlank": false,
    "blankPage": "about:blank",
    "ignoreStatusCode": true,
    "locale": "en-US",
    "blockedUrlPatterns": null,
    "additionalTraceCategories": "",
    "extraHeaders": null,
    "precomputedLanternData": null,
    "onlyAudits": null,
    "onlyCategories": [
      "performance",
      "accessibility",
      "best-practices",
      "seo"
    ],
    "skipAudits": null
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
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=9222', // Fixed port
      '--disable-dev-shm-usage', // Helps prevent crashes in some environments
      '--enable-logging', // Enable logging for debugging
      '--v=1' // Verbose logging
    ],
    port: 9222, 
  });

  // Wait for Chrome to fully launch
  await new Promise(resolve => setTimeout(resolve, 3000));

  const options = { ...lhConfig, port: chrome.port };

  try {
    const runnerResult = await lighthouse(url, options);
    return runnerResult.lhr;
  } catch (err) {
    console.error(`Lighthouse failed on ${url}:`, err);
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

        // Domain
        const domain = new URL(url).hostname;

        // Keep siteVersion empty for manual entry
        const siteVersion = "";

        // Grab metrics (in ms -> convert to seconds)
        const fcpMs = lhr.audits['first-contentful-paint']?.numericValue;
        const lcpMs = lhr.audits['largest-contentful-paint']?.numericValue;
        const tbtMs = lhr.audits['total-blocking-time']?.numericValue;
        const cls   = lhr.audits['cumulative-layout-shift']?.numericValue.toFixed(2);
        const speedIndexMs = lhr.audits['speed-index']?.numericValue;

        // Convert to seconds with 2 decimals
        const fcpSec =  fcpMs ?  (fcpMs / 1000).toFixed(2) : "";
        const lcpSec =  lcpMs ?  (lcpMs / 1000).toFixed(2) : "";
        const tbtSec =  tbtMs ?  (tbtMs / 1000).toFixed(2) : "";
        const speedIndexSec = speedIndexMs ? (speedIndexMs / 1000).toFixed(2) : "";

        // Category scores
        const performance   = lhr.categories.performance?.score ? lhr.categories.performance.score * 100 : "";
        const accessibility = lhr.categories.accessibility?.score ? lhr.categories.accessibility.score * 100 : "";
        const bestPractices = lhr.categories['best-practices']?.score ? lhr.categories['best-practices'].score * 100 : "";
        const seo           = lhr.categories.seo?.score ? lhr.categories.seo.score * 100 : "";


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
