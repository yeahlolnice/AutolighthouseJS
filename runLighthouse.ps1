# Define the path to Chrome
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

# Check if Chrome is installed
if (-Not (Test-Path $chromePath)) {
    Write-Host "Error: Chrome not found at $chromePath"
    exit 1
}

# Start Chrome with remote debugging mode
Write-Host "Starting Chrome in remote debugging mode..."
Start-Process -NoNewWindow -FilePath $chromePath -ArgumentList "--remote-debugging-port=9222", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"

# Wait a few seconds for Chrome to start
Start-Sleep -Seconds 3

# Check if Chrome is running by verifying if the port is open
$chromeRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 9222 -InformationLevel Quiet

if ($chromeRunning) {
    Write-Host "Chrome started successfully!"
    Write-Host "Running Lighthouse script..."
    
    # Run the Node.js script
    node main.js
} else {
    Write-Host "Error: Chrome did not start successfully."
    exit 1
}
