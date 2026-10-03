const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'www');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const itemsToCopy = [
  'index.html',
  'style.css',
  'portrait.css',
  'portrait.js',
  'lang.js',
  'layout.js',
  'intro-layout.js',
  'privacy.html',
  'PrivacyInfo.xcprivacy',
  'Names.csv',
  'audio',
  'shared',
  'scenarios',
  'pixelart_design'
];

itemsToCopy.forEach(item => {
  const src = path.resolve(__dirname, '..', item);
  const dest = path.join(outDir, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
});

console.log('Web assets successfully compiled to www/');
