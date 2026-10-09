const assert = require('node:assert/strict');
const { browserFixture } = require('./browser-fixture.cjs');
const { workspace, clone, personId } = require('./identity-fixture.cjs');
(async () => {
  const old = workspace(false), f = await browserFixture(old), { page, env } = f;
  page.setDefaultTimeout(10000);
  try {
    await f.login('manager');
    const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 180; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#193c67'; x.font = '28px sans-serif'; x.fillText('OLD TEST', 10, 40); return c.toDataURL(); });
    const unit = old.selectionUnits[0];
    unit.reviews.forEach((r, i) => Object.assign(r, { autoTopScore: 99 - i, ranked: ['b00', 'b01', 'b02'], scores: { b00: { c1: 89, 'required-price': 10 }, b01: { c1: 86, 'required-price': 10 }, b02: { c1: 84, 'required-price': 9 } }, opinion: '업데이트 전 최종 의견', signed: true, signature: { name: r.teacher, image, signedAt: '2026-10-01T10:00:00Z', signedAccountEmail: ['kim1', 'kim2', 'park'][i], customHistory: '보존할 원본 기록' } }));
    unit.recommendations = { b00: '업데이트 전에 확정한 추천 의견' };
    unit.signatures = { 'unit:u0:recommend:writer': clone(unit.reviews[0].signature), 'unit:u0:recommend:approver': { name: '교감', image, signedAt: '2026-10-01T11:00:00Z', signedAccountEmail: 'vice' } };
    for (const key of ['reviews', 'recommendations', 'signatures']) old[key] = clone(unit[key]);
    unit.opinionSources['unit:u0:recommend:b00'] = await page.evaluate(data => { const t = window.__identityTest; return t.oL(data, t.U3(data, data.subject)[0].b, 0); }, old);
    old.opinionSources = clone(unit.opinionSources);
    env.api.testWrite(old, 2); // Isolated r14-format fixture, not a school deployment.
    await page.reload();
    await page.getByRole('button', { name: /추천의견서/ }).first().click();
    await page.getByText('업데이트 전에 확정한 추천 의견', { exact: true }).last().waitFor({ state: 'attached' });
    assert.equal(await page.locator('.opinion-warning').count(), 0, 'identity-only migration does not falsely require recommendation reconfirmation');
    assert.equal(await page.locator('#print-area .signature-seal-mark img').count(), 2, 'old writer and vice-principal signatures still render');
    await page.getByRole('button', { name: /개인별 평가/ }).first().click();
    await page.locator('.evaluation-sheet img').waitFor();
    assert.ok((await page.locator('.evaluation-sheet').innerText()).includes('업데이트 전 최종 의견'));
    const previous = clone(old.selectionUnits[0].reviews[0].signature);
    await page.getByRole('button', { name: '평가 저장', exact: true }).click();
    await page.waitForFunction(() => window.__lastGasResponse?.request.method === 'PUT');
    assert.equal(await page.evaluate(() => window.__lastGasResponse.result.status), 200);
    const saved = env.api.testRead().data;
    assert.deepEqual(clone(saved.selectionUnits[0].reviews[0].signature), { ...previous, personId: personId('kim1') });
    assert.deepEqual(f.errors, []);
    console.log('r15 legacy browser: signed reviews, writer/vice signatures, original audit and unchanged recommendation confirmation preserved');
  } finally { await f.close(); }
})().catch(error => { console.error(error.message, error.stack.split('\n').filter(x => /^\s+at /.test(x)).slice(0,3).join('\n')); process.exitCode = 1; });
