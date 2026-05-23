const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'http://localhost:5500';
const screenshotsDir = path.join(__dirname, 'test-screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  let browser;
  try {
    console.log('🟡 Starting browser...');
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the app
    console.log('🟡 Navigating to dashboard...');
    await page.goto(`${FRONTEND_URL}/pages/dashboard.html`, { waitUntil: 'networkidle' });
    await sleep(1000);

    // Try to detect if we're logged in by checking for user info
    const userElement = await page.$('#user-name');
    if (!userElement) {
      console.log('🟡 Not logged in, attempting login...');
      // Assuming there's a login page or we need to check localStorage
      const tokenInStorage = await page.evaluate(() => localStorage.getItem('token'));
      
      if (!tokenInStorage) {
        console.log('⚠️ No login token found. Checking if there\'s a test account...');
        // Try to log in with a test account
        await page.goto(`${FRONTEND_URL}/index.html`, { waitUntil: 'networkidle' });
        await sleep(500);
        
        const emailInput = await page.$('input[type="email"]');
        if (emailInput) {
          console.log('🟡 Found login form, attempting login...');
          await page.fill('input[type="email"]', 'admin@test.com');
          await page.fill('input[type="password"]', 'test123');
          await page.click('button[type="submit"]');
          await sleep(2000);
        }
      }
    }

    // Take screenshot of dashboard with FAB visible
    console.log('🟡 Taking screenshot of dashboard FAB...');
    await page.screenshot({ path: path.join(screenshotsDir, '01-dashboard-fab.png') });
    
    // Check if body > button exists on dashboard
    const dashboardFab = await page.$('body > button.fab');
    if (dashboardFab) {
      console.log('✅ FAB button exists on dashboard');
      const fabText = await page.evaluate(() => {
        const fab = document.querySelector('body > button.fab');
        return fab ? fab.title : 'No title';
      });
      console.log('   FAB title:', fabText);
    } else {
      console.log('❌ FAB button NOT found on dashboard');
    }

    // Navigate to finance page
    console.log('🟡 Navigating to finance page...');
    await page.goto(`${FRONTEND_URL}/pages/finance.html`, { waitUntil: 'networkidle' });
    await sleep(1500);

    // Take screenshot of finance page with FAB
    console.log('🟡 Taking screenshot of finance page FAB...');
    await page.screenshot({ path: path.join(screenshotsDir, '02-finance-fab.png') });

    // Check if body > button exists on finance page
    const financeFab = await page.$('body > button.fab');
    if (financeFab) {
      console.log('✅ FAB button exists on finance page');
      const fabInfo = await page.evaluate(() => {
        const fab = document.querySelector('body > button.fab');
        if (!fab) return { title: 'Not found', hasListener: false };
        
        // Check if it has click listeners
        const eventListeners = getEventListeners ? getEventListeners(fab) : {};
        return {
          title: fab.title,
          innerHTML: fab.innerHTML.substring(0, 50),
          classes: fab.className
        };
      });
      console.log('   FAB info:', fabInfo);
    } else {
      console.log('❌ FAB button NOT found on finance page');
    }

    // Now test clicking the FAB on finance page
    console.log('🟡 Testing FAB click behavior on finance page...');
    const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle' });
    
    // Click the FAB
    await page.$eval('body > button.fab', el => el.click());
    
    // Wait for navigation with timeout
    try {
      await Promise.race([
        navigationPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), 3000))
      ]);
      
      const finalUrl = page.url();
      console.log('✅ Navigation occurred');
      console.log('   Final URL:', finalUrl);
      
      if (finalUrl.includes('order.html')) {
        console.log('✅ PASS: FAB correctly navigated to order.html');
        await page.screenshot({ path: path.join(screenshotsDir, '03-order-page-after-fab-click.png') });
      } else if (finalUrl.includes('finance.html')) {
        console.log('❌ FAIL: FAB opened modal on finance page instead of navigating');
        const isModalOpen = await page.$eval('#finance-modal', el => window.getComputedStyle(el).display);
        console.log('   Finance modal display:', isModalOpen);
        await page.screenshot({ path: path.join(screenshotsDir, '03-finance-modal-open.png') });
      }
    } catch (navErr) {
      console.log('⚠️ Navigation check:', navErr.message);
      const currentUrl = page.url();
      console.log('   Current URL:', currentUrl);
      await page.screenshot({ path: path.join(screenshotsDir, '03-after-fab-click.png') });
    }

    await context.close();
    await browser.close();
    
    console.log('\n📸 Screenshots saved to:', screenshotsDir);
    console.log('\n========== TEST COMPLETE ==========\n');

  } catch (error) {
    console.error('❌ Test error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

test();
