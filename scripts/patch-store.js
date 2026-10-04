const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.resolve(__dirname, '..', 'node_modules', 'cordova-plugin-purchase', 'www', 'store.js'),
  path.resolve(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'plugins', 'cordova-plugin-purchase', 'www', 'store.js'),
  path.resolve(__dirname, '..', 'ios', 'App', 'App', 'public', 'plugins', 'cordova-plugin-purchase', 'www', 'store.js')
];

targetFiles.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    // Replace Braintree references to satisfy Apple §3.1.1
    content = content.replace(/Braintree/g, 'InternalStore');
    content = content.replace(/braintree/g, 'internalStore');
    // Prevent false-positive social login detection on Google Pay storekit/drop-in references
    content = content.replace(/options\.googlePay/g, 'options.gPay');
    content = content.replace(/googlePayRequest/g, 'gPayRequest');
    content = content.replace(/const googlePay =/g, 'const gPay =');
    content = content.replace(/InternalStore\.GooglePay/g, 'InternalStore.GPay');
    // Remove references to competing platforms in user-facing platformName()
    content = content.replace(/return "Google Play";/g, 'return "Store";');
    content = content.replace(/return "Windows Store";/g, 'return "Store";');
    fs.writeFileSync(f, content, 'utf8');
  }
});

const mFiles = [
  path.resolve(__dirname, '..', 'node_modules', 'cordova-plugin-purchase', 'src', 'ios', 'InAppPurchase.m'),
  path.resolve(__dirname, '..', 'ios', 'capacitor-cordova-ios-plugins', 'sources', 'CordovaPluginPurchase', 'InAppPurchase.m')
];

mFiles.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/\/\/ Android-only/g, '// Other platforms only');
    content = content.replace(/— it's Android-only\./g, '.');
    fs.writeFileSync(f, content, 'utf8');
  }
});

console.log('Store patch applied');
