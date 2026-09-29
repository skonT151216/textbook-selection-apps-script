// One-time mechanical edit of the embedded, gzip-compressed frontend bundle.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const file = path.join(__dirname, '..', 'Index.html');
const wrapper = fs.readFileSync(file, 'utf8');
const match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
if (!match) throw Error('App bundle not found');
let source = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString('utf8');
function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) >= 0) throw Error(`Expected exactly one match: ${before.slice(0, 80)}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

replaceOnce(
  'function yZ({data:e,books:t,units:r,choices:n,onChoice:a}){let i=Object.keys(e.members);return(0,w.jsxs)("div",{children:[',
  'function yZ({data:e,books:t,units:r,choices:n,onChoice:a,showTargetName:o,onTargetNameChange:changeTargetName}){let i=Object.keys(e.members);return(0,w.jsxs)("div",{children:[(0,w.jsxs)("label",{className:"setup-target-option",children:[(0,w.jsx)("input",{type:"checkbox",checked:o,onChange:A=>changeTargetName(A.target.checked)}),(0,w.jsxs)("span",{children:[(0,w.jsx)("strong",{children:"개인별 평가표에 선정 대상명 표시"}),(0,w.jsx)("small",{children:"선정 대상명별로 따로 평가할 때 교과와 선정 대상명을 평가표와 PDF에 함께 표시합니다."})]})]}),'
);
replaceOnce(
  '(0,w.jsx)(yZ,{data:{...e,members:g},books:U,units:W,choices:L,onChoice:tt})',
  '(0,w.jsx)(yZ,{data:{...e,members:g},books:U,units:W,choices:L,onChoice:tt,showTargetName:f.showSelectionNameOnEvaluation!==false,onTargetNameChange:De=>m(He=>({...He,showSelectionNameOnEvaluation:De}))})'
);
replaceOnce(
  'function lL({data:e,review:t,filled:r}){var A;let n=D1(e)',
  'function selectionTargetOnSheet(e){let t=qd(e);return t&&t.mode==="course"&&(!e.setup||e.setup.showSelectionNameOnEvaluation!==false)?t:null}function lL({data:e,review:t,filled:r}){var A;let s=selectionTargetOnSheet(e),n=D1(e)'
);
replaceOnce(
  '(0,w.jsxs)("div",{className:"sheet-review-meta",children:[(0,w.jsxs)("span",{children:["\\uACFC\\uBAA9 : ",aL(e)]}),',
  '(0,w.jsxs)("div",{className:"sheet-review-meta",children:[(0,w.jsxs)("div",{className:"sheet-target-meta",children:[(0,w.jsx)("span",{children:s?"교과: "+s.subject:"\\uACFC\\uBAA9 : "+aL(e)}),s&&(0,w.jsxs)("strong",{className:"sheet-target-name",children:["선정 대상: ",s.selectionName||s.label]})]}),'
);
replaceOnce(
  '.evaluation-sheet .sheet-reviewer{',
  '.evaluation-sheet .sheet-target-meta{min-width:0;max-width:calc(100% - 230px);display:flex;flex-direction:column;align-items:flex-start;gap:2px}.evaluation-sheet .sheet-target-name{color:#153d64;font-size:16px;font-weight:700;line-height:1.25;overflow-wrap:anywhere}.setup-target-option{margin:0 0 18px;padding:14px 18px;border:1px solid #cddced;border-radius:12px;background:#f3f8ff;display:flex;gap:12px;align-items:flex-start;cursor:pointer}.setup-target-option input{width:18px;height:18px;margin:3px 0 0;flex:none;accent-color:#1857b6}.setup-target-option span{display:flex;flex-direction:column;gap:3px}.setup-target-option strong{color:#173454;font-size:15px}.setup-target-option small{color:#60748d;font-size:13px;line-height:1.45}.evaluation-sheet .sheet-reviewer{'
);

const encoded = zlib.gzipSync(Buffer.from(source, 'utf8'), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + encoded.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Added selection target display option and evaluation-sheet metadata');
