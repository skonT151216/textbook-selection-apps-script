const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { browserFixture } = require('./browser-fixture.cjs');
const { personId } = require('./identity-fixture.cjs');
const output = path.join(__dirname, '..', 'tmp', 'r15-qa');
fs.mkdirSync(output, { recursive: true });
async function main() {
  const f = await browserFixture(), { page, env } = f;
  page.setDefaultTimeout(10000);
  const nav = async name => { await page.getByRole('button', { name: new RegExp(name) }).first().click(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
  const logout = () => page.getByRole('button', { name: '로그아웃', exact: true }).click();
  const signature = async (index = 0, upload = false) => {
    await page.getByRole('button', { name: /서명하기|서명 확인·변경/ }).nth(index).click();
    const dialog = page.locator('.signature-dialog');
    const signer = await dialog.locator('.signer-name input').inputValue();
    assert.ok(signer && !signer.startsWith('teacher_'), 'signer field contains the real name');
    if (upload) {
      const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 280; c.height = 100; const x = c.getContext('2d'); x.fillStyle = '#b72030'; x.font = 'bold 34px sans-serif'; x.fillText('TEST 2', 30, 65); return c.toDataURL(); });
      await dialog.getByRole('button', { name: '이미지 첨부', exact: true }).click();
      await dialog.locator('input[type=file]').setInputFiles({ name: 'TEST.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
    } else {
      const bounds = await dialog.locator('canvas').boundingBox();
      await page.mouse.move(bounds.x + 35, bounds.y + 90); await page.mouse.down();
      for (let i = 0; i < 10; i++) await page.mouse.move(bounds.x + 35 + i * 22, bounds.y + 90 + (i % 2 ? 35 : -35));
      await page.mouse.up();
    }
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: '서명 저장', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const pdf = async (label, selector, expectedNames, imageCount, expectedOpinion) => {
    const sheet = page.locator(selector).last();
    const text = await sheet.innerText();
    assert.ok(!/teacher_[0-9a-f]+/.test(text), 'official form never displays internal references');
    assert.ok(!/등록 [123]/.test(text), 'selection disambiguators do not appear on official forms');
    for (const name of expectedNames) assert.ok(text.includes(name), label + ' real name: ' + name);
    if (expectedOpinion) assert.ok(text.includes(expectedOpinion), 'each namesake prints their own opinion');
    assert.equal(await sheet.locator('img').count(), imageCount, label + ' exact number of signature images');
    const print = await f.context.newPage();
    // The fixed-width landscape form is scaled to A4 by Chromium; portrait
    // tables must reflow within the actual printable width instead of clipping.
    await print.setViewportSize({ width: label.startsWith('01') || label.startsWith('02') ? 1123 : 718, height: 1000 });
    const html = await sheet.evaluate(node => ({ html: node.outerHTML, style: [...document.querySelectorAll('style')].map(s => s.outerHTML).join('') }));
    await print.setContent('<html lang="ko"><head><meta charset="utf-8">' + html.style + '</head><body>' + html.html + '</body></html>');
    await print.emulateMedia({ media: 'print' });
    assert.ok(await print.locator('table').evaluateAll(tables => tables.every(table => table.getBoundingClientRect().right <= document.documentElement.clientWidth + 1)), 'all printed table columns fit within the paper width');
    await print.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
    await print.pdf({ path: path.join(output, label + '-print.pdf'), format: 'A4', landscape: label.startsWith('01') || label.startsWith('02'), printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    await print.close();
    await page.getByRole('button', { name: 'PDF 미리보기', exact: true }).click();
    const modal = page.locator('.pdf-preview-dialog');
    const download = modal.getByRole('button', { name: 'PDF 다운로드', exact: true });
    await download.waitFor({ timeout: 60000 });
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    assert.ok(!file.suggestedFilename().includes('teacher_'));
    await file.saveAs(path.join(output, label + '-app.pdf'));
    assert.ok(fs.statSync(path.join(output, label + '-app.pdf')).size > 10000);
    await modal.getByRole('button', { name: '닫기', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
    console.log('PDF and browser print checked:', label);
  };
  try {
    await f.login('manager');
    await nav('업무 설정'); await nav('교직원·역할');
    await page.getByText('교직원 아이디와 협의회 역할', { exact: true }).waitFor();
    const parsed = await page.evaluate(async () => {
      const t = window.__identityTest, saved = await window.gasTestDispatch({ path: '/api/workspace', token: 'manager' });
      const text = '이름,교과,계정\n김교사,윤리,new-kim1\n김교사,역사,new-kim1\n김교사,윤리,new-kim2\n';
      return t.fZ(new TextEncoder().encode(text).buffer, 'csv', saved.body.setup.staff, 'school-id', ['윤리', '역사']);
    });
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.staff.length, 5, 'real CSV parser preserves namesakes and merges repeated school IDs');
    assert.deepEqual(parsed.staff.find(p => p.email === 'new-kim1').subjects, ['윤리', '역사']);
    const beforeOptions = await page.locator('select').evaluateAll(s => s.map(x => [...x.options].map(o => ({ value: o.value, text: o.text }))));
    assert.ok(beforeOptions.flat().some(o => o.text.includes('등록 1') && o.value === personId('kim1')));
    assert.ok(beforeOptions.flat().some(o => o.text.includes('등록 2') && o.value === personId('kim2')));
    await page.getByPlaceholder('예: 홍길동').fill('김교사');
    await page.getByPlaceholder('예: teacher01').first().fill('kim3');
    await page.locator('.setup-page').getByRole('checkbox').first().check();
    await page.getByRole('button', { name: '교직원 추가', exact: true }).click();
    await page.getByText(/김교사 교사를 윤리 교과협의회에 추가했습니다/).waitFor();
    await nav('최종 확인'); await page.getByRole('button', { name: '설정 저장', exact: true }).click();
    await page.waitForFunction(() => window.__lastGasResponse?.request.path === '/api/setup');
    assert.equal(env.api.testRead().data.setup.staff.length, 4, 'manual same-name addition persisted');
    await logout();
    for (const [account, rank, upload] of [['kim1', '1', false], ['kim2', '2', true], ['park', '3', false], ['kim3', '1', false]]) {
      await f.login(account); await nav('개인별 평가');
      const selects = page.locator('select');
      const rankSelects = selects.filter({ has: page.locator('option', { hasText: '1위' }) });
      await rankSelects.first().selectOption({ label: rank + '위' });
      await page.locator('textarea').first().fill(account + ' 교사의 독립적인 추천 의견입니다.');
      await signature(0, upload);
      const canonical = env.api.testRead().data;
      const key = canonical.setup.staff.find(p => p.email === account).id;
      const own = canonical.selectionUnits[0].reviews.find(r => r.teacher === key);
      assert.equal(own.signature.personId, key);
      assert.equal(own.signature.signedAccountEmail, account);
      assert.equal(own.opinion, account + ' 교사의 독립적인 추천 의견입니다.');
      await page.reload(); await nav('개인별 평가');
      assert.equal(await page.locator('.evaluation-sheet img').count(), 1, 'signature survives reload and renders on sheet');
      await logout();
    }
    await f.login('kim2'); await nav('총괄표'); await signature(); await logout();
    await f.login('kim1'); await nav('총괄표'); await signature();
    await nav('추천의견서');
    const recommendations = page.locator('textarea');
    for (let i = 0; i < await recommendations.count(); i++) await recommendations.nth(i).fill('교육과정에 적합하며 다양한 탐구와 평가 활동을 제공하여 추천합니다.');
    await page.getByRole('button', { name: /추천의견 저장/ }).click();
    await signature(); await logout();
    await f.login('vice'); await nav('추천의견서'); await signature(); await logout();
    await f.login('manager');
    assert.deepEqual(f.errors, [], 'no browser exceptions in the complete login/save flow');
    console.log('BROWSER FLOW PASSED', env.api.testRead().data.setup.staff.length, f.requests.length);
    await nav('평가내용 작성');
    await pdf('01-criteria', '.evaluation-sheet', [], 0);
    await nav('개인별 평가');
    await page.locator('select').nth(1).selectOption('0');
    await pdf('02-individual-kim1', '.evaluation-sheet', ['김교사'], 1, 'kim1 교사의 독립적인 추천 의견입니다.');
    await page.locator('select').nth(1).selectOption('1');
    await pdf('02-individual-kim2', '.evaluation-sheet', ['김교사'], 1, 'kim2 교사의 독립적인 추천 의견입니다.');
    await nav('총괄표');
    await pdf('03-summary', '#print-area', ['김교사', '박교사'], 2);
    await nav('추천의견서');
    await pdf('04-recommendation', '#print-area', ['김교사', '교감'], 2);
    await nav('결과물 모아보기');
    assert.ok(!/teacher_[0-9a-f]+/.test(await page.locator('#print-area').innerText()), 'all static batch sheets render real names');
    await page.locator('#print-area table').first().locator('tbody tr').nth(1).getByRole('checkbox').uncheck();
    await page.locator('input[type=radio][value=submission]').check();
    await page.getByRole('button', { name: '묶음 PDF 미리보기', exact: true }).click();
    const batch = page.locator('.pdf-preview-dialog');
    await batch.getByRole('button', { name: 'PDF 다운로드', exact: true }).waitFor({ timeout: 60000 });
    const [download] = await Promise.all([page.waitForEvent('download'), batch.getByRole('button', { name: 'PDF 다운로드', exact: true }).click()]);
    await download.saveAs(path.join(output, '05-batch-submission.pdf'));
    await batch.getByRole('button', { name: '닫기', exact: true }).click();
    console.log('Batch submission PDF checked');
    const persistedBeforeVirtual = JSON.stringify(env.api.testRead().data);
    await page.getByRole('link', { name: '서식 테스트', exact: true }).click();
    await page.getByRole('button', { name: '서식1·2·3 예시 자동 생성', exact: true }).click();
    await page.getByRole('button', { name: '선택한 예시 PDF 미리보기', exact: true }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('김교사'), 'virtual examples contain anonymous names only');
    await page.getByRole('button', { name: '선택한 예시 PDF 미리보기', exact: true }).click();
    const virtual = page.locator('.pdf-preview-dialog');
    await virtual.getByRole('button', { name: 'PDF 다운로드', exact: true }).waitFor({ timeout: 60000 });
    const [example] = await Promise.all([page.waitForEvent('download'), virtual.getByRole('button', { name: 'PDF 다운로드', exact: true }).click()]);
    await example.saveAs(path.join(output, '06-virtual-example.pdf'));
    assert.equal(JSON.stringify(env.api.testRead().data), persistedBeforeVirtual, 'virtual PDF generation never changes saved workspace');
    console.log('Anonymous virtual PDF checked without any workspace write');
    assert.deepEqual(f.errors, [], 'no browser errors in PDF, batch or virtual generation');
    console.log('Official forms checked; browser errors:', f.errors);
  } catch (error) {
    console.log('Fixture-only UI diagnostics:', (await page.locator('body').innerText()).slice(0,4300), f.errors);
    throw error;
  } finally { await f.close(); }
}
main().catch(error => { console.error(error.message, error.stack.split('\n').filter(x => /^\s+at /.test(x)).slice(0,3).join('\n')); process.exitCode = 1; });
