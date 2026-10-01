/**
 * User Manual Screenshot Capture Script
 * Captures annotated screenshots for all roles
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// User credentials for each role (from DEMO_ACCOUNTS in StaffLogin.jsx)
const USERS = {
  admin: { username: 'admin', password: 'Admin@123', role: 'Administrator', folder: 'admin' },
  counter: { username: 'counter1', password: 'Counter@123', role: 'Counter Staff', folder: 'counter-staff' },
  accountant: { username: 'accounts', password: 'Accounts@123', role: 'Accountant', folder: 'accountant' },
  poojari: { username: 'poojari1', password: 'Poojari@123', role: 'Poojari', folder: 'poojari' },
  committee: { username: 'committee1', password: 'Committee@123', role: 'Committee', folder: 'committee' }
};

// Annotation helper - adds visual elements to the page
async function addAnnotation(page, annotations) {
  await page.evaluate((annots) => {
    // Remove existing annotations
    document.querySelectorAll('.manual-annotation').forEach(el => el.remove());

    // Create annotation container
    const container = document.createElement('div');
    container.className = 'manual-annotation';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 99999;';

    annots.forEach((annot, idx) => {
      if (annot.type === 'arrow') {
        // Create arrow with label
        const arrow = document.createElement('div');
        arrow.style.cssText = `
          position: absolute;
          left: ${annot.x}px;
          top: ${annot.y}px;
          transform: rotate(${annot.rotation || 0}deg);
          font-size: 32px;
          color: #dc2626;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        `;
        arrow.innerHTML = '➜';
        container.appendChild(arrow);

        if (annot.label) {
          const label = document.createElement('div');
          label.style.cssText = `
            position: absolute;
            left: ${annot.labelX || annot.x + 40}px;
            top: ${annot.labelY || annot.y - 10}px;
            background: #dc2626;
            color: white;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: bold;
            font-family: Arial, sans-serif;
            white-space: nowrap;
            box-shadow: 2px 2px 6px rgba(0,0,0,0.3);
          `;
          label.textContent = annot.label;
          container.appendChild(label);
        }
      }

      if (annot.type === 'highlight') {
        const highlight = document.createElement('div');
        highlight.style.cssText = `
          position: absolute;
          left: ${annot.x}px;
          top: ${annot.y}px;
          width: ${annot.width}px;
          height: ${annot.height}px;
          border: 3px solid #dc2626;
          border-radius: 6px;
          background: rgba(220, 38, 38, 0.1);
          box-shadow: 0 0 10px rgba(220, 38, 38, 0.5);
        `;
        container.appendChild(highlight);

        if (annot.label) {
          const label = document.createElement('div');
          label.style.cssText = `
            position: absolute;
            left: ${annot.x}px;
            top: ${annot.y - 28}px;
            background: #dc2626;
            color: white;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: bold;
            font-family: Arial, sans-serif;
            white-space: nowrap;
          `;
          label.textContent = annot.label;
          container.appendChild(label);
        }
      }

      if (annot.type === 'number') {
        const num = document.createElement('div');
        num.style.cssText = `
          position: absolute;
          left: ${annot.x}px;
          top: ${annot.y}px;
          width: 28px;
          height: 28px;
          background: #dc2626;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: bold;
          font-family: Arial, sans-serif;
          box-shadow: 2px 2px 6px rgba(0,0,0,0.4);
        `;
        num.textContent = annot.number;
        container.appendChild(num);
      }

      if (annot.type === 'callout') {
        const callout = document.createElement('div');
        callout.style.cssText = `
          position: absolute;
          left: ${annot.x}px;
          top: ${annot.y}px;
          background: #1e40af;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-family: Arial, sans-serif;
          max-width: 280px;
          box-shadow: 3px 3px 10px rgba(0,0,0,0.3);
        `;
        callout.innerHTML = annot.text;
        container.appendChild(callout);
      }
    });

    document.body.appendChild(container);
  }, annotations);
}

// Remove all annotations
async function clearAnnotations(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.manual-annotation').forEach(el => el.remove());
  });
}

// Take screenshot with optional annotations
async function screenshot(page, name, folder, annotations = null) {
  if (annotations) {
    await addAnnotation(page, annotations);
    await page.waitForTimeout(100);
  }

  const filepath = path.join(SCREENSHOT_DIR, folder, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  ✓ ${name}.png`);

  if (annotations) {
    await clearAnnotations(page);
  }
}

// Login helper - uses the demo account buttons for quick login
async function login(page, username, password) {
  await page.goto(`${BASE_URL}/staff-login`);
  await page.waitForTimeout(1000);

  // Fill the form
  const inputs = await page.locator('input.input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill(username);
    await inputs[1].fill(password);

    // Find and click the login button
    await page.click('button:has-text("Login")');
    await page.waitForTimeout(2000);
  }
}

// Quick login using demo account buttons
async function quickLogin(page, role) {
  await page.goto(`${BASE_URL}/staff-login`);
  await page.waitForTimeout(1000);

  // Click the demo account button by role name
  try {
    await page.click(`button:has-text("${role}")`);
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log(`  Note: Could not find quick login for ${role}, using form login`);
    const user = Object.values(USERS).find(u => u.role === role);
    if (user) {
      await login(page, user.username, user.password);
    }
  }
}

// Logout helper
async function logout(page) {
  try {
    // Look for logout button in sidebar or header
    const logoutBtn = await page.locator('button:has-text("Logout"), button:has-text("Sign Out"), a:has-text("Logout")').first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    await page.goto(`${BASE_URL}/staff-login`);
    await page.waitForTimeout(500);
  }
}

// Get element position for annotations
async function getElementPosition(page, selector) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible()) {
      const box = await el.boundingBox();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    }
  } catch (e) {}
  return null;
}

// Wait for page to be ready
async function waitForPage(page, timeout = 1500) {
  await page.waitForTimeout(timeout);
  await page.waitForLoadState('networkidle').catch(() => {});
}

// ============================================
// COMMON SCREENSHOTS
// ============================================
async function captureCommonScreenshots(page) {
  console.log('\n📸 Capturing Common Screenshots...');
  const folder = 'common';

  // 1. Login Page - clean view
  await page.goto(`${BASE_URL}/staff-login`);
  await waitForPage(page);
  await screenshot(page, '01-login-page', folder);

  // 2. Login Page with annotations showing form fields
  await screenshot(page, '02-login-form-explained', folder, [
    { type: 'number', x: 600, y: 195, number: '1' },
    { type: 'callout', x: 720, y: 185, text: 'Enter your username' },
    { type: 'number', x: 600, y: 270, number: '2' },
    { type: 'callout', x: 720, y: 260, text: 'Enter your password' },
    { type: 'number', x: 600, y: 370, number: '3' },
    { type: 'callout', x: 720, y: 360, text: 'Click to login' }
  ]);

  // 3. Demo accounts section
  await screenshot(page, '03-demo-accounts', folder, [
    { type: 'callout', x: 900, y: 480, text: 'Click any demo account to quick login' }
  ]);

  // 4. Login and capture dashboard
  await quickLogin(page, 'Administrator');
  await waitForPage(page, 2000);
  await screenshot(page, '04-login-success-dashboard', folder);

  // 5. Navigation sidebar highlighted
  await screenshot(page, '05-navigation-sidebar', folder, [
    { type: 'highlight', x: 0, y: 0, width: 220, height: 800, label: 'Navigation Menu' }
  ]);

  // 6. User menu area
  await screenshot(page, '06-user-profile-area', folder, [
    { type: 'callout', x: 30, y: 720, text: 'User info & Logout' }
  ]);

  await logout(page);
}

// ============================================
// ADMIN SCREENSHOTS
// ============================================
async function captureAdminScreenshots(page) {
  console.log('\n📸 Capturing Admin Screenshots...');
  const folder = 'admin';

  await quickLogin(page, 'Administrator');
  await waitForPage(page, 2000);

  // Dashboard
  await screenshot(page, '01-dashboard-overview', folder, [
    { type: 'callout', x: 250, y: 20, text: 'Admin Dashboard - Full system overview' }
  ]);

  // Dashboard KPI tiles
  await screenshot(page, '02-dashboard-kpi-tiles', folder, [
    { type: 'highlight', x: 230, y: 80, width: 1000, height: 120, label: 'Key Performance Indicators' }
  ]);

  // --- DEVOTEES ---
  await page.goto(`${BASE_URL}/admin/devotees`);
  await waitForPage(page);
  await screenshot(page, '03-devotees-list', folder);

  // Add button highlight
  await screenshot(page, '04-devotees-add-button', folder, [
    { type: 'arrow', x: 1100, y: 85, rotation: 0, label: 'Add New Devotee' }
  ]);

  // Click Add button
  try {
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(500);
    await screenshot(page, '05-devotees-create-form', folder, [
      { type: 'callout', x: 550, y: 50, text: 'Fill all required fields' }
    ]);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) { console.log('  Note: Add devotee dialog not captured'); }

  // --- BOOKINGS ---
  await page.goto(`${BASE_URL}/admin/bookings`);
  await waitForPage(page);
  await screenshot(page, '06-bookings-list', folder);

  // New Booking
  await page.goto(`${BASE_URL}/admin/bookings/new`);
  await waitForPage(page);
  await screenshot(page, '07-new-booking-form', folder, [
    { type: 'callout', x: 800, y: 100, text: 'Create new pooja booking' }
  ]);

  // --- DONATIONS ---
  await page.goto(`${BASE_URL}/admin/donations`);
  await waitForPage(page);
  await screenshot(page, '08-donations-list', folder);

  try {
    await page.click('button:has-text("Add"), button:has-text("Record"), button:has-text("New")');
    await page.waitForTimeout(500);
    await screenshot(page, '09-donations-create-form', folder);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) {}

  // --- HUNDI ---
  await page.goto(`${BASE_URL}/admin/hundi`);
  await waitForPage(page);
  await screenshot(page, '10-hundi-list', folder);

  // --- AUCTION ---
  await page.goto(`${BASE_URL}/admin/auction`);
  await waitForPage(page);
  await screenshot(page, '11-auction-list', folder);

  // --- ANNADANAM ---
  await page.goto(`${BASE_URL}/admin/annadanam`);
  await waitForPage(page);
  await screenshot(page, '12-annadanam-list', folder);

  // --- COUNTER ---
  await page.goto(`${BASE_URL}/admin/counter`);
  await waitForPage(page);
  await screenshot(page, '13-counter-screen', folder, [
    { type: 'callout', x: 500, y: 30, text: 'Quick billing counter' }
  ]);

  // --- WASTE SALES ---
  await page.goto(`${BASE_URL}/admin/waste-sales`);
  await waitForPage(page);
  await screenshot(page, '14-waste-sales-list', folder);

  // --- POOJA MASTER ---
  await page.goto(`${BASE_URL}/admin/pooja-master`);
  await waitForPage(page);
  await screenshot(page, '15-pooja-master-list', folder);

  try {
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(500);
    await screenshot(page, '16-pooja-master-create-form', folder);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) {}

  // --- POOJARI MASTER ---
  await page.goto(`${BASE_URL}/admin/poojari-master`);
  await waitForPage(page);
  await screenshot(page, '17-poojari-master-list', folder);

  // --- POOJARI SCHEDULE ---
  await page.goto(`${BASE_URL}/admin/poojari-schedule`);
  await waitForPage(page);
  await screenshot(page, '18-poojari-schedule', folder);

  // --- DAILY CLOSING ---
  await page.goto(`${BASE_URL}/admin/daily-closing`);
  await waitForPage(page);
  await screenshot(page, '19-daily-closing', folder, [
    { type: 'callout', x: 700, y: 30, text: 'End-of-day reconciliation' }
  ]);

  // --- REPORTS ---
  await page.goto(`${BASE_URL}/admin/reports`);
  await waitForPage(page);
  await screenshot(page, '20-reports-page', folder);

  // --- ANALYTICS ---
  await page.goto(`${BASE_URL}/admin/analytics`);
  await waitForPage(page);
  await screenshot(page, '21-analytics-dashboard', folder);

  // --- USERS ---
  await page.goto(`${BASE_URL}/admin/users`);
  await waitForPage(page);
  await screenshot(page, '22-users-list', folder);

  try {
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(500);
    await screenshot(page, '23-users-create-form', folder);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) {}

  // --- ROLES ---
  await page.goto(`${BASE_URL}/admin/roles`);
  await waitForPage(page);
  await screenshot(page, '24-roles-list', folder);

  // --- DONATION MASTER ---
  await page.goto(`${BASE_URL}/admin/donation-master`);
  await waitForPage(page);
  await screenshot(page, '25-donation-master', folder);

  // --- VENDOR MASTER ---
  await page.goto(`${BASE_URL}/admin/vendors`);
  await waitForPage(page);
  await screenshot(page, '26-vendor-master', folder);

  // --- FESTIVAL MASTER ---
  await page.goto(`${BASE_URL}/admin/festival-master`);
  await waitForPage(page);
  await screenshot(page, '27-festival-master', folder);

  // --- COMMITTEE ---
  await page.goto(`${BASE_URL}/admin/committee-master`);
  await waitForPage(page);
  await screenshot(page, '28-committee-master', folder);

  // --- AUCTION ITEMS ---
  await page.goto(`${BASE_URL}/admin/auction-items`);
  await waitForPage(page);
  await screenshot(page, '29-auction-items-master', folder);

  // --- HUNDI ITEMS ---
  await page.goto(`${BASE_URL}/admin/hundi-items`);
  await waitForPage(page);
  await screenshot(page, '30-hundi-items-master', folder);

  // --- CALENDAR ---
  await page.goto(`${BASE_URL}/admin/calendar`);
  await waitForPage(page);
  await screenshot(page, '31-calendar-view', folder);

  // --- AUDIT TRAIL ---
  await page.goto(`${BASE_URL}/admin/audit-trail`);
  await waitForPage(page);
  await screenshot(page, '32-audit-trail', folder);

  // --- BACKUP RESTORE ---
  await page.goto(`${BASE_URL}/admin/backup-restore`);
  await waitForPage(page);
  await screenshot(page, '33-backup-restore', folder);

  // --- NOTIFICATIONS ---
  await page.goto(`${BASE_URL}/admin/notifications`);
  await waitForPage(page);
  await screenshot(page, '34-notifications-config', folder);

  // --- SETTINGS ---
  await page.goto(`${BASE_URL}/admin/settings`);
  await waitForPage(page);
  await screenshot(page, '35-settings', folder);

  // --- VERIFY TICKET ---
  await page.goto(`${BASE_URL}/admin/verify-ticket`);
  await waitForPage(page);
  await screenshot(page, '36-verify-ticket', folder);

  // --- POOJA HISTORY ---
  await page.goto(`${BASE_URL}/admin/pooja-history`);
  await waitForPage(page);
  await screenshot(page, '37-pooja-history', folder);

  await logout(page);
}

// ============================================
// COUNTER STAFF SCREENSHOTS
// ============================================
async function captureCounterStaffScreenshots(page) {
  console.log('\n📸 Capturing Counter Staff Screenshots...');
  const folder = 'counter-staff';

  await quickLogin(page, 'Counter Staff');
  await waitForPage(page, 2000);

  // Dashboard
  await screenshot(page, '01-dashboard', folder, [
    { type: 'callout', x: 400, y: 20, text: 'Counter Staff Dashboard' }
  ]);

  // Counter Screen (Primary workspace)
  await page.goto(`${BASE_URL}/admin/counter`);
  await waitForPage(page);
  await screenshot(page, '02-counter-main', folder, [
    { type: 'callout', x: 500, y: 20, text: 'Your primary billing workspace' }
  ]);

  await screenshot(page, '03-counter-workflow', folder, [
    { type: 'number', x: 240, y: 100, number: '1' },
    { type: 'number', x: 600, y: 100, number: '2' },
    { type: 'number', x: 240, y: 650, number: '3' },
    { type: 'callout', x: 850, y: 150, text: '1. Select Devotee\n2. Choose Pooja\n3. Complete Payment' }
  ]);

  // Bookings
  await page.goto(`${BASE_URL}/admin/bookings`);
  await waitForPage(page);
  await screenshot(page, '04-bookings-list', folder);

  // New Booking
  await page.goto(`${BASE_URL}/admin/bookings/new`);
  await waitForPage(page);
  await screenshot(page, '05-new-booking', folder);

  // Devotees
  await page.goto(`${BASE_URL}/admin/devotees`);
  await waitForPage(page);
  await screenshot(page, '06-devotees', folder);

  // Donations
  await page.goto(`${BASE_URL}/admin/donations`);
  await waitForPage(page);
  await screenshot(page, '07-donations', folder);

  // Hundi
  await page.goto(`${BASE_URL}/admin/hundi`);
  await waitForPage(page);
  await screenshot(page, '08-hundi', folder);

  // Auction
  await page.goto(`${BASE_URL}/admin/auction`);
  await waitForPage(page);
  await screenshot(page, '09-auction', folder);

  // Annadanam
  await page.goto(`${BASE_URL}/admin/annadanam`);
  await waitForPage(page);
  await screenshot(page, '10-annadanam', folder);

  // Waste Sales
  await page.goto(`${BASE_URL}/admin/waste-sales`);
  await waitForPage(page);
  await screenshot(page, '11-waste-sales', folder);

  // Calendar
  await page.goto(`${BASE_URL}/admin/calendar`);
  await waitForPage(page);
  await screenshot(page, '12-calendar', folder);

  // Pooja History
  await page.goto(`${BASE_URL}/admin/pooja-history`);
  await waitForPage(page);
  await screenshot(page, '13-pooja-history', folder);

  await logout(page);
}

// ============================================
// ACCOUNTANT SCREENSHOTS
// ============================================
async function captureAccountantScreenshots(page) {
  console.log('\n📸 Capturing Accountant Screenshots...');
  const folder = 'accountant';

  await quickLogin(page, 'Accountant');
  await waitForPage(page, 2000);

  // Dashboard
  await screenshot(page, '01-dashboard', folder, [
    { type: 'callout', x: 400, y: 20, text: 'Accountant Dashboard - Financial Overview' }
  ]);

  // Daily Closing (Primary task)
  await page.goto(`${BASE_URL}/admin/daily-closing`);
  await waitForPage(page);
  await screenshot(page, '02-daily-closing', folder, [
    { type: 'callout', x: 500, y: 20, text: 'Your primary task - Daily Reconciliation' }
  ]);

  // Reports
  await page.goto(`${BASE_URL}/admin/reports`);
  await waitForPage(page);
  await screenshot(page, '03-reports-main', folder);

  // Analytics
  await page.goto(`${BASE_URL}/admin/analytics`);
  await waitForPage(page);
  await screenshot(page, '04-analytics', folder);

  // View Donations
  await page.goto(`${BASE_URL}/admin/donations`);
  await waitForPage(page);
  await screenshot(page, '05-donations-view', folder, [
    { type: 'callout', x: 900, y: 20, text: 'View only - Cannot edit' }
  ]);

  // View Hundi
  await page.goto(`${BASE_URL}/admin/hundi`);
  await waitForPage(page);
  await screenshot(page, '06-hundi-view', folder);

  // View Auction
  await page.goto(`${BASE_URL}/admin/auction`);
  await waitForPage(page);
  await screenshot(page, '07-auction-view', folder);

  // View Annadanam
  await page.goto(`${BASE_URL}/admin/annadanam`);
  await waitForPage(page);
  await screenshot(page, '08-annadanam-view', folder);

  // View Waste Sales
  await page.goto(`${BASE_URL}/admin/waste-sales`);
  await waitForPage(page);
  await screenshot(page, '09-waste-sales-view', folder);

  // Counter view
  await page.goto(`${BASE_URL}/admin/counter`);
  await waitForPage(page);
  await screenshot(page, '10-counter-view', folder);

  await logout(page);
}

// ============================================
// POOJARI SCREENSHOTS
// ============================================
async function capturePoojariScreenshots(page) {
  console.log('\n📸 Capturing Poojari Screenshots...');
  const folder = 'poojari';

  await quickLogin(page, 'Poojari');
  await waitForPage(page, 2000);

  // Dashboard / My Poojas (auto-redirects)
  await screenshot(page, '01-dashboard-my-poojas', folder, [
    { type: 'callout', x: 400, y: 20, text: 'Your Pooja Queue for Today' }
  ]);

  // My Poojas Queue
  await page.goto(`${BASE_URL}/admin/my-poojas`);
  await waitForPage(page);
  await screenshot(page, '02-my-poojas-queue', folder);

  // Queue with workflow explanation
  await screenshot(page, '03-queue-workflow', folder, [
    { type: 'number', x: 300, y: 150, number: '1' },
    { type: 'callout', x: 500, y: 140, text: 'View assigned poojas' },
    { type: 'number', x: 300, y: 250, number: '2' },
    { type: 'callout', x: 500, y: 240, text: 'Click to mark complete' }
  ]);

  // Verify Ticket
  await page.goto(`${BASE_URL}/admin/verify-ticket`);
  await waitForPage(page);
  await screenshot(page, '04-verify-ticket', folder, [
    { type: 'callout', x: 500, y: 150, text: 'Scan or enter ticket number to verify' }
  ]);

  await logout(page);
}

// ============================================
// COMMITTEE SCREENSHOTS
// ============================================
async function captureCommitteeScreenshots(page) {
  console.log('\n📸 Capturing Committee Screenshots...');
  const folder = 'committee';

  await quickLogin(page, 'Committee');
  await waitForPage(page, 2000);

  // Dashboard
  await screenshot(page, '01-dashboard', folder, [
    { type: 'callout', x: 400, y: 20, text: 'Committee Dashboard - Verification Authority' }
  ]);

  // Hundi Verification (Primary task)
  await page.goto(`${BASE_URL}/admin/hundi`);
  await waitForPage(page);
  await screenshot(page, '02-hundi-verification', folder, [
    { type: 'callout', x: 700, y: 20, text: 'Primary Task: Verify Hundi Collections' }
  ]);

  // Hundi workflow
  await screenshot(page, '03-hundi-workflow', folder, [
    { type: 'number', x: 900, y: 150, number: '1' },
    { type: 'callout', x: 750, y: 200, text: 'Click Verify to approve' }
  ]);

  // Auction Verification
  await page.goto(`${BASE_URL}/admin/auction`);
  await waitForPage(page);
  await screenshot(page, '04-auction-verification', folder, [
    { type: 'callout', x: 700, y: 20, text: 'Verify auction entries' }
  ]);

  // Waste Sales Verification
  await page.goto(`${BASE_URL}/admin/waste-sales`);
  await waitForPage(page);
  await screenshot(page, '05-waste-sales-verification', folder);

  // Daily Closing
  await page.goto(`${BASE_URL}/admin/daily-closing`);
  await waitForPage(page);
  await screenshot(page, '06-daily-closing', folder);

  // Reports
  await page.goto(`${BASE_URL}/admin/reports`);
  await waitForPage(page);
  await screenshot(page, '07-reports', folder);

  // Analytics
  await page.goto(`${BASE_URL}/admin/analytics`);
  await waitForPage(page);
  await screenshot(page, '08-analytics', folder);

  // Committee Members
  await page.goto(`${BASE_URL}/admin/committee-master`);
  await waitForPage(page);
  await screenshot(page, '09-committee-members', folder);

  // Counter view
  await page.goto(`${BASE_URL}/admin/counter`);
  await waitForPage(page);
  await screenshot(page, '10-counter-view', folder);

  await logout(page);
}

// ============================================
// MAIN EXECUTION
// ============================================
async function main() {
  console.log('🚀 Starting User Manual Screenshot Capture...\n');
  console.log(`📁 Screenshots will be saved to: ${SCREENSHOT_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5
  });

  const page = await context.newPage();

  try {
    await captureCommonScreenshots(page);
    await captureAdminScreenshots(page);
    await captureCounterStaffScreenshots(page);
    await captureAccountantScreenshots(page);
    await capturePoojariScreenshots(page);
    await captureCommitteeScreenshots(page);

    console.log('\n✅ All screenshots captured successfully!');
    console.log(`📁 Screenshots saved to: ${SCREENSHOT_DIR}`);

    // List all captured files
    const folders = ['common', 'admin', 'counter-staff', 'accountant', 'poojari', 'committee'];
    let total = 0;
    for (const f of folders) {
      const dir = path.join(SCREENSHOT_DIR, f);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
        total += files.length;
        console.log(`   ${f}: ${files.length} screenshots`);
      }
    }
    console.log(`\n📊 Total: ${total} screenshots captured`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

main();
