const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const regex = /(?:src|href)=["'](https?:[^"']+)["']/g;
let m;
while ((m = regex.exec(html)) !== null) {
  console.log(m[1]);
}
