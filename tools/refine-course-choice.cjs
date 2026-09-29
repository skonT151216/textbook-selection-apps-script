// Follow-up mechanical bundle edit after validating against an actual high-school catalog.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const file = path.join(__dirname, '..', 'Index.html');
const wrapper = fs.readFileSync(file, 'utf8');
const match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
if (!match) throw Error('App bundle not found');
let source = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString('utf8');
function replace(before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + 1) >= 0) throw Error('Expected one match: ' + before.slice(0, 90));
  source = source.slice(0, index) + after + source.slice(index + before.length);
}
if (!source.includes('option("single","한 번에 평가"')) {
  replace('if(r.length<2)return; if(n.length===1&&n[0].mode==="bundle"', 'if(n.length===1&&n[0].mode==="single"&&r.length<2)return"single";if(r.length<2)return; if(n.length===1&&n[0].mode==="bundle"');
  replace('u=(A[0]&&A[0].criteria)||n;if(i==="course"', 'u=(A[0]&&A[0].criteria)||n;if(!i&&c.length<2&&courseNames(t,e).length>1&&!A.some(v1))return A;if(i==="course"');
  replace('o.length<2&&(0,w.jsxs)("div",{className:"selection-method-auto"', 'o.length<2&&s.length<2&&(0,w.jsxs)("div",{className:"selection-method-auto"');
  replace('children:[...(o.length>1?[option("bundle"', 'children:[...(o.length<2&&s.length>1?[option("single","한 번에 평가","등록된 도서 전체를 한 선정 대상으로 평가합니다.")]:[]),...(o.length>1?[option("bundle"');
  replace('if(Pe.length>1&&!L[At]&&!We)return"".concat(At,"\\uC758 \\uC5EC\\uB7EC \\uAD8C\\uC744 \\uBB36\\uC5B4\\uC11C \\uD3C9\\uAC00\\uD560\\uC9C0 \\uAC01\\uAC01 \\uD3C9\\uAC00\\uD560\\uC9C0 \\uC120\\uD0DD\\uD574 \\uC8FC\\uC138\\uC694.")', 'if((Pe.length>1||courseNames(U,At).length>1)&&!L[At]&&!We)return At+": 여러 도서를 한 번에 평가할지 선정 대상별로 나눌지 선택해 주세요."');
}
replace('.setup-catalog-table table{min-width:1000px}', '.setup-catalog-table table{min-width:1160px}.setup-catalog-table td:nth-child(7) input{min-width:170px}');
replace(',o&&(0,w.jsx)("p",{className:"setup-error setup-catalog-error"', ',(0,w.jsx)("p",{className:"setup-catalog-note",children:"같은 도서를 여러 출판사가 발행한 경우 선정 대상명을 같게 입력하세요. 도서명으로 자동 채우며, 엑셀의 ‘선정 대상명’ 열도 읽습니다."}),o&&(0,w.jsx)("p",{className:"setup-error setup-catalog-error"');
const encoded = zlib.gzipSync(Buffer.from(source, 'utf8'), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + encoded.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Refined selection choice for multiple textbook titles');
