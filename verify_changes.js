const fs = require('fs');
const path = require('path');

console.log('========== VERIFICATION: Finance Button Navigation Fix ==========\n');

// Read the modified files
const sidebarPath = path.join(__dirname, 'frontend', 'js', 'components', 'sidebar.js');
const financePath = path.join(__dirname, 'frontend', 'js', 'pages', 'finance.js');

const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
const financeContent = fs.readFileSync(financePath, 'utf8');

console.log('📋 Checking sidebar.js changes...');

// Check that finance.html skip has been removed
if (sidebarContent.includes("currentPage === 'finance.html'")) {
  console.log('❌ FAIL: sidebar.js still has finance.html skip condition');
  process.exit(1);
} else {
  console.log('✅ PASS: sidebar.js no longer skips finance.html FAB creation');
}

// Check that order.html skip is still there
if (sidebarContent.includes("currentPage === 'order.html'")) {
  console.log('✅ PASS: sidebar.js still skips FAB on order.html');
} else {
  console.log('❌ FAIL: sidebar.js lost the order.html skip condition');
  process.exit(1);
}

console.log('\n📋 Checking finance.js changes...');

// Check that the FAB creation code has been removed
if (financeContent.includes('financeFab') && financeContent.includes('document.body.appendChild')) {
  console.log('❌ FAIL: finance.js still has FAB creation code');
  process.exit(1);
} else {
  console.log('✅ PASS: finance.js no longer creates its own FAB');
}

// Check that the admin-only button display logic is still there
if (financeContent.includes("addEntryButton.style.display = ''")) {
  console.log('✅ PASS: finance.js still shows #add-entry-button for admins');
} else {
  console.log('⚠️  WARNING: #add-entry-button display logic may have been removed');
}

console.log('\n📋 Checking HTML structure...');
const htmlPath = path.join(__dirname, 'frontend', 'pages', 'finance.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

if (htmlContent.includes('id="add-entry-button"')) {
  console.log('✅ PASS: finance.html has #add-entry-button element');
} else {
  console.log('❌ FAIL: finance.html missing #add-entry-button element');
  process.exit(1);
}

console.log('\n========== ANALYSIS ==========\n');
console.log('✅ All code changes verified successfully!\n');
console.log('Expected behavior:');
console.log('  1. FAB on finance page navigates to order.html (via sidebar.js)');
console.log('  2. #add-entry-button in header opens the add entry modal (for admins)');
console.log('  3. No conflicts between FAB buttons');
console.log('\nThis matches the dashboard behavior where FAB navigates to order page.');

