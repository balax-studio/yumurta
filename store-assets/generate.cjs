const fs = require('fs');
const path = require('path');
const deps = 'C:/Users/YSR_MONSTER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(deps + '/playwright');
const sharp = require(deps + '/sharp');
const out = path.join(__dirname, 'tr-TR');
const data = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const scenes = [
  ['01-ciftligini-kur', '1_gameplay_collapsed', 'Kendi çiftliğini kur', 'İlk tavuktan büyük hayallere'],
  ['02-gelistirmeler', '2_gameplay_expanded', 'Üretimini geliştir', 'Kazancını çiftliğine yatır'],
  ['03-yumurta-fabrikasi', '5_retirement', 'Fabrikanı büyüt', 'Makineler çalışsın, yumurtalar aksın'],
  ['04-oyun-modlari', '3_main_menu', 'Kendi tarzında oyna', 'Beş farklı mod, yeni hedefler'],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [name, state, title, subtitle] of scenes) {
      const context = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, locale: 'tr-TR' });
      const page = await context.newPage();
      await page.addInitScript(() => { localStorage.setItem('chickenIdleLang', 'tr'); });
      await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.setScreenshotState === 'function');
      await page.waitForTimeout(11000);
      await page.evaluate(async state => { window.changeLanguage('tr'); await window.setScreenshotState(state, 'phone'); }, state);
      await page.waitForTimeout(1700);
      await page.screenshot({ path: path.join(out, name + '-ham.png') });
      await context.close();
      const poster = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
      await poster.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;width:1080px;height:1920px;background:#184b36;font-family:Arial,sans-serif;color:#fff4d9;text-align:center;overflow:hidden}h1{font-size:66px;margin:38px 20px 12px;font-weight:900;letter-spacing:-2px}p{font-size:30px;margin:0;color:#edcf86}img{position:absolute;left:72px;top:224px;width:936px;height:1664px;image-rendering:pixelated;box-shadow:0 10px 0 #092d21;border-radius:12px}</style><h1>${title}</h1><p>${subtitle}</p><img src="${data(path.join(out, name + '-ham.png'))}"></html>`);
      await poster.screenshot({ path: path.join(out, name + '.png') });
      await poster.close();
      console.log('Captured ' + name);
    }
    const feature = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    await feature.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;width:1024px;height:500px;background:#164833;color:#fff6dc;font-family:Arial,sans-serif;overflow:hidden}.game{position:absolute;right:0;top:0;width:470px;height:500px;object-fit:cover;object-position:center 40%;image-rendering:pixelated}.shade{position:absolute;inset:0;background:linear-gradient(90deg,#164833 0%,#164833 49%,transparent 76%)}.copy{position:absolute;left:56px;top:63px;width:535px}.tag{font-size:19px;letter-spacing:4px;color:#f4cd68;font-weight:800}h1{font-size:70px;line-height:1.03;letter-spacing:-3px;margin:22px 0 14px;font-weight:900;text-shadow:0 4px #082f21}h1 span{color:#f4cd68}p{font-size:27px;line-height:1.45;max-width:440px;margin:22px 0;font-weight:600}.line{height:6px;width:80px;background:#f4cd68}</style><img class="game" src="${data(path.join(out, '03-yumurta-fabrikasi-ham.png'))}"><div class="shade"></div><div class="copy"><div class="tag">IDLE TYCOON</div><h1>Yumurta<br><span>Fabrikası</span></h1><div class="line"></div><p>Küçük bir kümes.<br>Kocaman bir fabrika.</p></div></html>`);
    await feature.screenshot({ path: path.join(out, 'ozellik-grafigi-1024x500.png') });
    await feature.close();
    const results = [];
    for (const name of [...scenes.map(s => s[0] + '.png'), 'ozellik-grafigi-1024x500.png']) {
      const file = path.join(out, name);
      const meta = await sharp(file).metadata();
      const bytes = fs.statSync(file).size;
      if (name.startsWith('ozellik') ? (meta.width !== 1024 || meta.height !== 500 || bytes > 15e6) : (meta.width !== 1080 || meta.height !== 1920 || bytes > 8e6)) throw new Error('Invalid asset: ' + name);
      results.push({ file: name, width: meta.width, height: meta.height, bytes });
    }
    fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
