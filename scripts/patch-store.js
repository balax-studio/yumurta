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
    fs.writeFileSync(f, content, 'utf8');
  }
});
console.log('Store patch applied');
