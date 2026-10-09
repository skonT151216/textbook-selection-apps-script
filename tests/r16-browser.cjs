const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { browserFixture } = require('./browser-fixture.cjs');
const { workspace, clone } = require('./identity-fixture.cjs');
const subjects = [['생명', '생물의 유전'], ['물리', '전자기와 양자'], ['지구과학', '행성우주과학'], ['화학', '화학반응의 세계']];
const output = path.join(__dirname, '..', 'tmp', 'r16-qa');
fs.mkdirSync(output, { recursive: true });
function scienceData() {
  const base = workspace(true), template = clone(base.selectionUnits[0]);
  base.books = [];
  base.members = {}; base.departmentHeads = {}; base.summaryWriters = {};
  base.setup.staff.forEach(person => { person.subjects = subjects.map(([subject]) => subject); });
  base.selectionUnits = subjects.map(([subject, title], index) => {
    const unit = clone(template), ids = [0, 1, 2, 3].map(i => 'science-' + index + '-' + i);
    base.books.push(...ids.map((id, i) => ({ id, subject, title, selectionName: title, volume: '3-1', publisher: '가상출판' + (i + 1), author: '가상저자', price: 10000 + 1000 * i })));
    Object.assign(unit, { id: 'science-unit-' + index, subject, label: subject + ' 3-1', mode: 'single', volumes: ['3-1'], candidates: ids.map(id => ({ id, label: base.books.find(book => book.id === id).publisher, bookIds: [id] })) });
    delete unit.selectionName;
    unit.reviews.forEach((review, i) => Object.assign(review, { ranked: ids, autoTopScore: 99, scores: Object.fromEntries(ids.map((id, j) => [id, { c1: 89 - j * 3, 'required-price': 10 }])), opinion: '기존에 확정한 ' + title + ' 추천 의견 ' + i, signed: true }));
    unit.recommendations = Object.fromEntries(ids.slice(0, 3).map(id => [id, '기존 최종 추천의견을 그대로 유지합니다.']));
    base.members[subject] = unit.reviews.map(review => review.teacher);
    base.departmentHeads[subject] = unit.reviews[0].teacher;
    base.summaryWriters[subject] = unit.reviews[1].teacher;
    return unit;
  });
  const first = base.selectionUnits[0]; base.activeUnitId = first.id;
  for (const key of ['subject', 'criteria', 'reviews', 'topScore', 'gap', 'recommendations', 'signatures', 'opinionSources']) base[key] = clone(first[key]);
  return base;
}
async function main() {
  const f = await browserFixture(scienceData()), { page, env } = f;
  page.setDefaultTimeout(12000);
  const nav = async name => { await page.getByRole('button', { name: new RegExp(name) }).first().click(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
  try {
    await f.login('manager');
    const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#17385c'; x.font = '26px sans-serif'; x.fillText('OLD TEST', 8, 40); return c.toDataURL(); });
    let canonical = clone(env.api.testIdentity.normalize(scienceData()));
    canonical.selectionUnits.forEach(unit => {
      unit.reviews.forEach((review, i) => { review.signature = { name: canonical.identityNames[review.teacher], personId: review.teacher, image, signedAt: '2026-10-01T11:00:00Z', signedAccountEmail: ['kim1', 'kim2', 'park'][i], originalAudit: 'r15 최종 서명 원본' }; });
      const writer = baseName => ({ name: canonical.identityNames[baseName], personId: baseName, image, signedAt: '2026-10-01T12:00:00Z', originalAudit: '기존 역할 서명 원본' });
      unit.signatures = {
        ['unit:' + unit.id + ':summary:writer']: writer(canonical.summaryWriters[unit.subject]),
        ['unit:' + unit.id + ':summary:checker']: writer(canonical.departmentHeads[unit.subject]),
        ['unit:' + unit.id + ':recommend:writer']: writer(canonical.departmentHeads[unit.subject]),
        ['unit:' + unit.id + ':recommend:approver']: { name: '교감', image, signedAt: '2026-10-01T13:00:00Z', signedAccountEmail: 'vice' },
      };
    });
    for (const key of ['reviews', 'signatures']) canonical[key] = clone(canonical.selectionUnits[0][key]);
    // Fingerprints are deliberately generated with the original r15 unit label.
    canonical = await page.evaluate(data => {
      const t = window.__identityTest;
      for (const unit of data.selectionUnits) {
        const scoped = t.Fb({ ...data, activeUnitId: unit.id, subject: unit.subject });
        t.U3(scoped, unit.subject).slice(0, 3).forEach((row, rank) => { unit.opinionSources['unit:' + unit.id + ':recommend:' + row.b.id] = t.oL(scoped, row.b, rank); });
      }
      data.opinionSources = structuredClone(data.selectionUnits[0].opinionSources);
      return data;
    }, canonical);
    env.api.testWrite(canonical, 2);
    const before = clone(env.api.testRead().data);
    await page.reload();
    for (const [index, [subject, title]] of subjects.entries()) {
      const select = page.locator('#workspace-unit');
      await select.selectOption('science-unit-' + index);
      assert.equal(await select.locator('option:checked').innerText(), subject + ' · ' + title);
      for (const screen of ['평가내용 작성', '개인별 평가', '총괄표', '추천의견서']) {
        await nav(screen);
        const text = await page.locator(screen === '평가내용 작성' || screen === '개인별 평가' ? '.evaluation-sheet' : '#print-area').innerText();
        assert.ok(text.includes(title), screen + ' includes ' + title);
        if (screen === '개인별 평가') assert.equal(await page.locator('.evaluation-sheet img').count(), 1);
        if (screen === '총괄표' || screen === '추천의견서') assert.equal(await page.locator('#print-area img').count(), 2);
        assert.equal(await page.locator('.opinion-warning').count(), 0, 'unchanged original opinions never need reconfirmation');
        // Real app PDF generation; no server writes are needed to change labels.
        if (index === 0) {
          await page.getByRole('button', { name: 'PDF 미리보기', exact: true }).click();
          const modal = page.locator('.pdf-preview-dialog'), download = modal.getByRole('button', { name: 'PDF 다운로드', exact: true });
          await download.waitFor({ timeout: 60000 });
          const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
          assert.ok(file.suggestedFilename().includes(title));
          await file.saveAs(path.join(output, ['01-criteria', '02-individual', '03-summary', '04-recommendation'][['평가내용 작성', '개인별 평가', '총괄표', '추천의견서'].indexOf(screen)] + '.pdf'));
          await modal.getByRole('button', { name: '닫기', exact: true }).click();
          await modal.waitFor({ state: 'hidden' });
        }
      }
    }
    assert.deepEqual(clone(env.api.testRead().data), before, 'all display/PDF/navigation leaves the complete original workspace byte-equivalent');
    await nav('결과물 모아보기');
    for (const [subject, title] of subjects) assert.ok((await page.locator('#print-area').innerText()).includes(subject + ' · ' + title));
    // Keep the first unit only using the actual result-table controls.
    const checks = page.locator('.results-table tbody').getByRole('checkbox');
    if (!(await checks.first().isChecked())) await checks.first().check();
    for (let i = 1; i < await checks.count(); i++) if (await checks.nth(i).isChecked()) await checks.nth(i).uncheck();
    await page.locator('input[type=radio][value=submission]').check();
    await page.getByRole('button', { name: '묶음 PDF 미리보기', exact: true }).click();
    const batch = page.locator('.pdf-preview-dialog');
    await batch.getByRole('button', { name: 'PDF 다운로드', exact: true }).waitFor({ timeout: 60000 });
    const [file] = await Promise.all([page.waitForEvent('download'), batch.getByRole('button', { name: 'PDF 다운로드', exact: true }).click()]);
    await file.saveAs(path.join(output, '05-batch.pdf'));
    await batch.getByRole('button', { name: '닫기', exact: true }).click();
    assert.deepEqual(clone(env.api.testRead().data), before);
    await nav('개인별 평가');
    await page.locator('#workspace-unit').selectOption('science-unit-0');
    await page.getByRole('button', { name: '평가 저장', exact: true }).click();
    await page.waitForFunction(() => window.__lastGasResponse?.request.method === 'PUT');
    assert.equal(await page.evaluate(() => window.__lastGasResponse.result.status), 200);
    assert.deepEqual(clone(env.api.testRead().data.selectionUnits), before.selectionUnits, 'normal evaluation save preserves every original unit, label, score, signature and opinion fingerprint');
    await page.reload(); await nav('추천의견서');
    assert.equal(await page.locator('.opinion-warning').count(), 0);
    await nav('업무 설정'); await nav('선정 방식');
    assert.ok((await page.locator('.selection-method-list').innerText()).includes('생명 · 생물의 유전'));
    assert.deepEqual(f.errors, []);
    console.log('r16 browser passed: four subjects, all forms, saved signatures/fingerprints, read-only display/PDF, normal save, reload and setup. Five PDFs generated.');
  } catch (error) {
    console.log('Fixture-only diagnostics:', (await page.locator('body').innerText()).slice(0, 2000), f.errors);
    throw error;
  } finally { await f.close(); }
}
main().catch(error => { console.error(error.message, error.stack.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 3).join('\n')); process.exitCode = 1; });
