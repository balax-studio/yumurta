const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '..', 'node_modules', '@capacitor-community', 'admob', 'ios', 'Sources', 'AdMobPlugin', 'Consent', 'ConsentExecutor.swift');

if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, 'utf8');
  content = content.replace(/UMPConsentStatus/g, 'ConsentStatus');
  fs.writeFileSync(target, content, 'utf8');
  console.log('AdMob UMPConsentStatus patch applied');
}
