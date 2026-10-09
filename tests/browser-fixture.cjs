const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const userCache = path.join(require('node:os').homedir(), '.cache');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(userCache, 'codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const { fixture, workspace } = require('./identity-fixture.cjs');
async function browserFixture(data = workspace(true)) {
  const env = fixture(data), errors = [], requests = [];
  let html = zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8').match(/<pre id="app-bundle">([\s\S]*?)<\/pre>/)[1].replace(/\s/g, ''), 'base64')).toString();
  const anchor = '(0,j7.createRoot)(document.getElementById("root")).render';
  if (!html.includes(anchor)) throw Error('Browser test export anchor missing');
  html = html.replace(anchor, 'var identityTestRoot=(0,j7.createRoot)(document.getElementById("root"));window.__identityTest={TeacherIdentity,HI,fZ,Fb,qd,U3,qg,oL,lL,LZ,QZ,MZ,jZ,unitDisplayLabel,selectionDisplayName,render:(type,props)=>identityTestRoot.render((0,w.jsx)(type,props)),setDirectory:(s,n)=>{teacherDirectory=s;teacherHistoricalNames=n||{}}};identityTestRoot.render');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || path.join(userCache, 'puppeteer/chrome/mac_arm-154.0.8037.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.exposeBinding('gasTestDispatch', async (_, request) => {
    requests.push({ path: request.path, method: request.method });
    try { return env.api.apiDispatch(request); } catch (error) { throw Error(error.message); }
  });
  await context.addInitScript(() => {
    window.google = { script: { run: {
      withSuccessHandler(success) { return { withFailureHandler(failure) { return { apiDispatch(request) { window.gasTestDispatch(request).then(result => { window.__lastGasResponse = { request, result }; success(result); }, failure); } }; } }; },
    } } };
  });
  await context.route('https://identity.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto('https://identity.test/');
  const login = async account => {
    await page.getByPlaceholder('예: teacher01').fill(account);
    await page.getByRole('button', { name: '내 업무 시작하기' }).click();
    await page.getByRole('button', { name: '로그아웃', exact: true }).waitFor();
  };
  return { env, browser, context, page, login, errors, requests, close: () => browser.close() };
}
module.exports = { browserFixture };
