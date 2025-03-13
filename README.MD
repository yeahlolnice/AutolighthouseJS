## 1. Prerequisites
1. Node.js installed on your system
2. npm (or Yarn) for package management
3. A Google Cloud project with the Google Sheets API enabled
    - You’ll create credentials (Service Account JSON, for example) that your script can use to authenticate.

## 2. Enable Google Sheets API & Get Credentials
1. Go to the Google Cloud Console.
2. Create or select an existing project.
3. Enable the Google Sheets API in the APIs & Services Library.
4. Create credentials (Service Account recommended):
    - When you create a Service Account, you’ll get a .json file containing your  private key and client email.
    - Important: Share your Google Sheet with that Service Account email address (something like my-service-account@my-project.iam.gserviceaccount.com) so it has permission to edit/append to the Sheet.

## Basic Script: main.js
Below is an example script that:

1. Defines a list of URLs to test.
2. Runs Lighthouse on each URL to get performance, accessibility, best practices, and SEO scores.
3. Appends a row to the bottom of your Google Sheet with:
    - Date/time
    - The URL (or relative path)
    - Lighthouse category scores (you can add more metrics if you want)


## What This Script Does
1. Authenticates using your service account JSON file (service-account.json).
    - Make sure you’ve shared your Google Sheet with the service account’s email address.
2. For each URL in URLS_TO_TEST:
    - Launches Chrome in headless mode
    - Runs Lighthouse
    - Extracts the scores from lhr.categories
3. Builds a “row” (array) with [dateTime, url, performance, accessibility, bestPractices, seo]
4. Appends all rows at once to the bottom of the target Google Sheet.
