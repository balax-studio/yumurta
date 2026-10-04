const fs = require('fs');
const path = require('path');
const deps = 'C:/Users/YSR_MONSTER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(deps + '/playwright');
const sharp = require(deps + '/sharp');
const out = path.join(__dirname, 'ios-tr-TR');
const scenes = [
  ['01-fabrikani-buyut', '03-yumurta-fabrikasi', 'Fabrikanı<br>büyüt', 'Makineler çalışsın, yumurtalar aksın'],
  ['02-ciftligini-kur', '01-ciftligini-kur', 'Kendi çiftliğini<br>kur', 'İlk tavuktan büyük hayallere'],
  ['03-uretimini-gelistir', '02-gelistirmeler', 'Üretimini<br>geliştir', 'Kazancını çiftliğine yatır'],
  ['04-oyun-modlari', '04-oyun-modlari', 'Kendi tarzında<br>oyna', 'Beş farklı mod, yeni hedefler'],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const [name, source, headline, subtitle] of scenes) {
      const image = (await sharp(path.join(__dirname, 'ios-source', source + '.png'))
        .extract({ left: 72, top: 224, width: 936, height: 1664 }).png().toBuffer()).toString('base64');
      const page = await browser.newPage({ viewport: { width: 1242, height: 2688 }, deviceScaleFactor: 1 });
      await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;width:1242px;height:2688px;background:#184b36;font-family:Arial,sans-serif;color:#fff4d9;text-align:center;overflow:hidden}.brand{position:absolute;top:65px;width:100%;font-size:27px;letter-spacing:5px;color:#edcf86;font-weight:800}h1{position:absolute;top:127px;width:100%;font-size:108px;line-height:1.05;margin:0;font-weight:900;letter-spacing:-3px}p{position:absolute;top:402px;width:100%;font-size:38px;margin:0;color:#edcf86}.line{position:absolute;top:491px;left:576px;width:90px;height:7px;background:#edcf86}img{position:absolute;left:54px;top:580px;width:1134px;height:2016px;image-rendering:pixelated;border-radius:16px;box-shadow:0 14px 0 #092d21}</style><div class="brand">YUMURTA FABRİKASI</div><h1>${headline}</h1><p>${subtitle}</p><div class="line"></div><img src="data:image/png;base64,${image}"></html>`);
      await page.locator('img').evaluate(img => img.decode());
      const file = path.join(out, name + '.png');
      await page.screenshot({ path: file });
      await page.close();
      const meta = await sharp(file).metadata();
      const bytes = fs.statSync(file).size;
      if (meta.width !== 1242 || meta.height !== 2688 || meta.format !== 'png' || meta.hasAlpha) throw Error('Invalid screenshot: ' + name);
      results.push({ file: name + '.png', width: meta.width, height: meta.height, bytes });
    }
    fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
