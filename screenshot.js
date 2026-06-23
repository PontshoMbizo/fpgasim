const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set a good desktop viewport
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });
    
    const screenshotPath = '/home/pontsho/.gemini/antigravity-cli/brain/12127869-0696-403a-a13b-9984aa5c7255/scratch/ui_screenshot.png';
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);
  } catch (err) {
    console.error('Error taking screenshot:', err);
  } finally {
    await browser.close();
  }
})();
