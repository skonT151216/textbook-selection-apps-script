// Reproducible, display-only patch of the standalone GAS frontend.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const file = path.join(root, 'Index.html'), wrapper = fs.readFileSync(file, 'utf8');
const match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
if (!match) throw Error('App bundle not found');
let html = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString();
const helper = fs.readFileSync(path.join(root, 'identity/selection-display.js'), 'utf8');
const begin = '/* selection-display-start */', end = '/* selection-display-end */';
function replace(before, after, count = 1) {
  const matches = html.split(before);
  if (matches.length !== count + 1) throw Error('Unexpected patch count: ' + before);
  html = matches.join(after);
}
if (html.includes(begin)) {
  html = html.slice(0, html.indexOf(begin)) + begin + '\n' + helper + end + html.slice(html.indexOf(end) + end.length);
} else {
  replace('function $d(e,t)', begin + '\n' + helper + end + 'function $d(e,t)');
  replace('children:dt.label},dt.id)', 'children:unitDisplayLabel(dt,t.books)},dt.id)');
  replace('children:D.label},D.id)', 'children:unitDisplayLabel(D,e.books)},D.id)');
  replace('children:[M.label," \\xB7 "', 'children:[unitDisplayLabel(M,t.books)," \\xB7 "');
  replace('L.map(M=>M.label).join', 'L.map(M=>unitDisplayLabel(M,t.books)).join');
  replace('c.map(g=>g.label+" · 후보 "', 'c.map(g=>unitDisplayLabel(g,t)+" · 후보 "');
  replace('{unitId:t.id,label:t.label,subject:n,scoped:r,', '{unitId:t.id,label:unitDisplayLabel(t,e.books),subject:n,scoped:r,');
  replace('"".concat($d(t),"_")', '"".concat(selectionDisplayName(t),"_")');
  replace('children:[$d(e),', 'children:[selectionDisplayName(e),', 2);
  replace('children:["\\uACFC\\uBAA9: ",$d(e)]', 'children:["\\uACFC\\uBAA9: ",selectionDisplayName(e)]', 2);
  replace('function selectionTargetOnSheet(e){let t=qd(e);return t&&t.mode==="course"&&(!e.setup||e.setup.showSelectionNameOnEvaluation!==false)?t:null}',
    'function selectionTargetOnSheet(e){let t=qd(e);if(!t||e.setup&&e.setup.showSelectionNameOnEvaluation===false)return null;if(t.mode==="course")return t;let n=singleUnitTargetName(t,e.books||[]);return n?{...t,selectionName:n}:null}');
  replace('선정 대상명별로 따로 평가할 때 교과와 선정 대상명을 평가표와 PDF에 함께 표시합니다.', '선정 대상명별 평가와 도서 종류가 하나인 평가에서 교과와 도서명을 평가표·PDF에 함께 표시합니다.');
}
if (!html.includes('sheet-criteria-target')) {
  replace('r&&(0,w.jsxs)("div",{className:"sheet-review-meta"',
    '!r&&s&&(0,w.jsx)("div",{className:"sheet-review-meta sheet-criteria-target",children:(0,w.jsxs)("div",{className:"sheet-target-meta",children:[(0,w.jsx)("span",{children:"교과: "+s.subject}),(0,w.jsxs)("strong",{className:"sheet-target-name",children:["선정 대상: ",s.selectionName||s.label]})]})}),r&&(0,w.jsxs)("div",{className:"sheet-review-meta"');
}
// $d remains the stored label used by UZ/oL fingerprints. Changing it would
// falsely flag confirmed opinions merely because the presentation improved.
for (const name of ['UZ', 'oL']) {
  const start = html.indexOf('function ' + name + '(');
  const source = html.slice(start, html.indexOf('function ', start + 9));
  if (!source.includes('unit:$d(e)')) throw Error('Saved opinion fingerprint must use the original unit label');
}
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const packed = zlib.gzipSync(Buffer.from(html), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + packed.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Updated single-title unit display without changing stored units or opinion fingerprints');
