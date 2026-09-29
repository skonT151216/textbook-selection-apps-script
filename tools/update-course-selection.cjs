// One-time mechanical edit of the embedded, gzip-compressed application bundle.
// Keep this script so a future maintainer can inspect the exact source changes.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const file = path.join(__dirname, '..', 'Index.html');
const wrapper = fs.readFileSync(file, 'utf8');
const match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
if (!match) throw Error('App bundle not found');
let source = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString('utf8');

function replaceOnce(before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) throw Error(`Expected one match: ${before.slice(0, 90)}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}
function replaceSection(start, end, after) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0 || source.indexOf(start, first + 1) >= 0) throw Error(`Section not found: ${start}`);
  source = source.slice(0, first) + after + source.slice(last);
}

// An optional spreadsheet column and an editable catalog column let publishers'
// slightly different book titles point at the same selection target.
replaceOnce('title:["\\uB3C4\\uC11C\\uBA85","\\uAD50\\uACFC\\uC11C\\uBA85","\\uCC45\\uBA85"],price:', 'title:["\\uB3C4\\uC11C\\uBA85","\\uAD50\\uACFC\\uC11C\\uBA85","\\uCC45\\uBA85"],selectionName:["선정 대상명","선정대상명","선정 과목명","선정과목명"],price:');
replaceOnce('let L=U("subject"),O=U("title"),W=U("author"),M=U("price"),j=kb(O)', 'let L=U("subject"),O=U("title"),W=U("author"),S=U("selectionName"),M=U("price"),j=kb(O)');
replaceOnce('z.length===1?(D!==null&&(z[0].price=D),P&&!z[0].volume&&(z[0].volume=P)):a.push({id:n(),subject:L,publisher:I,author:W,title:O||"".concat(L," \\uAD50\\uACFC\\uC11C"),volume:P,price:D})', 'z.length===1?(D!==null&&(z[0].price=D),P&&!z[0].volume&&(z[0].volume=P),S&&(z[0].selectionName=S)):a.push({id:n(),subject:L,publisher:I,author:W,title:O||"".concat(L," \\uAD50\\uACFC\\uC11C"),selectionName:S||O||"".concat(L," \\uAD50\\uACFC\\uC11C"),volume:P,price:D})');
replaceOnce('D.author!==Z.author||D.title!==Z.title', 'D.author!==Z.author||D.title!==Z.title||D.selectionName!==Z.selectionName');
replaceOnce('author:D.author,title:D.title})', 'author:D.author,title:D.title,selectionName:D.selectionName})');
replaceOnce('subject:n,volume:"",publisher:"",author:"",title:"",price:null', 'subject:n,volume:"",publisher:"",author:"",title:"",selectionName:"",price:null');
replaceOnce('(0,w.jsx)("th",{children:"\\uB3C4\\uC11C\\uBA85"}),(0,w.jsx)("th",{children:"\\uAC00\\uACA9"})', '(0,w.jsx)("th",{children:"\\uB3C4\\uC11C\\uBA85"}),(0,w.jsx)("th",{children:"선정 대상명"}),(0,w.jsx)("th",{children:"\\uAC00\\uACA9"})');
replaceOnce('["subject","volume","publisher","author","title"].map(j=>', '["subject","volume","publisher","author","title","selectionName"].map(j=>');
replaceOnce('value:O[j],onChange:P=>{let Z=P.target.value;if(j!=="title"){L(O.id,{[j]:Z});return}let D=kb(O.title),z=kb(Z);L(O.id,{title:Z,...!O.volume||O.volume===D?{volume:z}:{}})}})', 'value:j==="selectionName"?O.selectionName||O.title:O[j]||"",onChange:P=>{let Z=P.target.value;if(j!=="title"){L(O.id,{[j]:Z});return}let D=kb(O.title),z=kb(Z);L(O.id,{title:Z,...!O.volume||O.volume===D?{volume:z}:{},...!O.selectionName||O.selectionName===O.title?{selectionName:Z}:{}})}})');
replaceOnce('function Gg(e,t){return YI(e.filter(r=>r.subject===t).map(r=>r.volume.trim()).filter(Boolean)).sort(XI.compare)}', 'function Gg(e,t){return YI(e.filter(r=>r.subject===t).map(r=>(r.volume||"").trim()).filter(Boolean)).sort(XI.compare)}function courseName(e){return(e.selectionName||e.title||"").trim()}function courseNames(e,t){return YI(e.filter(r=>r.subject===t).map(courseName).filter(Boolean)).sort(XI.compare)}');

replaceSection('function C3(', 'function $I(', `function C3(e,t,r){let n=e.filter(a=>a.subject===t&&a.status!=="archived");if(n.length&&n.every(a=>a.mode==="course"))return"course";if(r.length<2)return; if(n.length===1&&n[0].mode==="bundle"&&Sb(n[0].volumes,r))return"bundle";if(n.length===r.length&&n.every(a=>a.mode==="separate"&&a.volumes.length===1&&r.includes(a.volumes[0])))return"separate"}`);
replaceSection('function k3(', 'function ZI(', `function k3({subject:e,label:t,mode:r,selectionName:s="",volumes:n,candidates:a,books:i,members:A,criteria:o,existing:c}){let u=c||uz({subject:e,label:t,mode:r,volumes:n,criteria:o,members:A}),f={...u,subject:e,label:t,mode:r,selectionName:s,volumes:n,candidates:a,reviews:JI(u,A)};return{...f,status:dB(f,i)?"active":"draft"}}function wZ({subject:e,books:t,members:r,criteria:n,existingUnits:a,choice:i}){let A=a.filter(d=>d.subject===e&&d.status!=="archived"),o=t.filter(d=>d.subject===e),c=Gg(t,e),u=(A[0]&&A[0].criteria)||n;if(i==="course"&&(!A.some(v1)||A.every(d=>d.mode==="course"))){return courseNames(t,e).map(s=>{let y=A.find(d=>d.mode==="course"&&d.selectionName===s),b=o.filter(d=>courseName(d)===s);return y&&v1(y)?{...y,reviews:JI(y,r)}:k3({subject:e,label:e+" · "+s,mode:"course",selectionName:s,volumes:[],candidates:$I(b),books:t,members:r,criteria:u,existing:y})})}if(A.some(v1))return A.map(d=>({...d,reviews:JI(d,r)}));if(c.length>1&&!i)return A;if(c.length>1&&i==="separate")return c.map(d=>{let y=A.find(b=>b.mode==="separate"&&b.volumes.length===1&&b.volumes[0]===d);return k3({subject:e,label:e+" "+d,mode:"separate",volumes:[d],candidates:$I(o.filter(b=>b.volume===d)),books:t,members:r,criteria:u,existing:y})});if(c.length>1&&i==="bundle"){let d=A.find(y=>y.mode==="bundle"&&Sb(y.volumes,c));return[k3({subject:e,label:e+" "+c.join("·"),mode:"bundle",volumes:c,candidates:bZ(o,c,(d&&d.candidates)||[]),books:t,members:r,criteria:u,existing:d})]}let f=c.length===1?c:[],m=A.find(d=>d.mode==="single"&&Sb(d.volumes,f));return[k3({subject:e,label:c.length===1?e+" "+c[0]:e,mode:"single",volumes:f,candidates:$I(o),books:t,members:r,criteria:u,existing:m})]}`);

replaceSection('function yZ(', 'var Xg=', `function yZ({data:e,books:t,units:r,choices:n,onChoice:a}){let i=Object.keys(e.members);return(0,w.jsxs)("div",{children:[(0,w.jsxs)("div",{className:"setup-section-title",children:[(0,w.jsx)(k4,{}),(0,w.jsxs)("div",{children:[(0,w.jsx)("h2",{children:"과목별 선정 방식"}),(0,w.jsx)("p",{children:"어느 교과든 도서를 한 번에 평가하거나, 권별 또는 선정 대상명별로 나누어 평가할 수 있습니다. 도서·가격 단계에서 같은 대상의 도서들은 선정 대상명을 같게 입력하세요."})]})]}),(0,w.jsx)("div",{className:"selection-method-list",children:i.map(A=>{let o=Gg(t,A),s=courseNames(t,A),c=r.filter(g=>g.subject===A&&g.status!=="archived"),u=c.some(v1),f=c.length>0&&c.every(g=>dB(g,t)),m=n[A]||C3(c,A,o);let option=(mode,title,description)=> (0,w.jsxs)("button",{type:"button",className:m===mode?"selected":"",disabled:u,onClick:()=>a(A,mode),children:[(0,w.jsx)(mode==="course"?wd:k4,{}),(0,w.jsxs)("span",{children:[(0,w.jsx)("strong",{children:title}),(0,w.jsx)("small",{children:description})]})]},mode);return(0,w.jsxs)("article",{className:"selection-method-card "+(u?"locked":""),children:[(0,w.jsxs)("header",{children:[(0,w.jsxs)("div",{children:[(0,w.jsx)("h3",{children:A}),(0,w.jsxs)("span",{children:[t.filter(g=>g.subject===A).length,"권 등록",o.length>0&&" · "+o.join(" · ")]})]}),(0,w.jsx)("strong",{className:f?"ready":"needs-check",children:f?"설정 완료":"확인 필요"})]}),o.length<2&&(0,w.jsxs)("div",{className:"selection-method-auto",children:[(0,w.jsx)(wd,{}),(0,w.jsxs)("span",{children:[(0,w.jsx)("strong",{children:"기본: 한 번 평가"}),(0,w.jsx)("small",{children:"등록된 도서 전체를 한 선정 대상으로 평가합니다."})]})]}),(0,w.jsxs)("div",{className:"selection-method-options",children:[...(o.length>1?[option("bundle","같은 출판사로 묶어서 평가",o.join("·")+"를 한 후보로 묶습니다."),option("separate","각 권을 따로 평가","권별로 독립된 평가표와 추천의견서를 만듭니다.")]:[]),...(s.length>1||m==="course"?[option("course","선정 대상명별로 따로 평가","도서명으로 기본 분류하며, 대상명은 도서·가격 단계에서 수정할 수 있습니다. 각 대상은 평가·순위·서명·PDF가 분리됩니다.")]:[])]}),m==="course"&&(0,w.jsx)("p",{className:"setup-catalog-note",children:"선정 대상: "+s.join(" · ")}), (0,w.jsxs)("footer",{children:[(0,w.jsx)("span",{children:c.length?c.map(g=>g.label+" · 후보 "+g.candidates.length+"개").join(", "):"선정 방식 선택이 필요합니다."}),u&&(0,w.jsx)("small",{children:"평가가 시작된 선정 대상은 후보 구성이 보호됩니다."})]})]},A)})})]})}`);

// Browser-side validation mirrors the server and gives immediate setup feedback.
replaceOnce('new Set(e.volumes).size!==e.volumes.length&&r.push(', 'e.mode==="course"&&!(e.selectionName||"").trim()&&r.push(e.label+": 선정 대상명을 입력해 주세요.");new Set(e.volumes).size!==e.volumes.length&&r.push(');
replaceOnce('i.some(A=>A.subject!==e.subject)&&r.push("".concat(e.label,": \\uB2E4\\uB978 \\uACFC\\uBAA9 \\uB3C4\\uC11C\\uAC00 \\uC5F0\\uACB0\\uB418\\uC5B4 \\uC788\\uC2B5\\uB2C8\\uB2E4.")),e.mode!=="bundle"', 'i.some(A=>A.subject!==e.subject)&&r.push("".concat(e.label,": \\uB2E4\\uB978 \\uACFC\\uBAA9 \\uB3C4\\uC11C\\uAC00 \\uC5F0\\uACB0\\uB418\\uC5B4 \\uC788\\uC2B5\\uB2C8\\uB2E4.")),e.mode==="course"&&i.some(A=>courseName(A)!==e.selectionName)&&r.push(e.label+": 다른 선정 대상의 도서가 연결되어 있습니다."),e.mode!=="bundle"');
replaceOnce('if(Q.some(At=>!He.some(Pe=>Pe.subject===At)))return', 'for(let At of Q){let Pe=He.filter(st=>st.subject===At&&st.mode==="course");if(Pe.length){let We=Object.fromEntries(U.filter(st=>st.subject===At).map(st=>[st.id,0]));for(let st of Pe)for(let Ft of st.candidates)for(let vt of Ft.bookIds)We[vt]=(We[vt]||0)+1;if(Object.values(We).some(st=>st!==1))return At+": 모든 도서를 하나의 선정 대상에 정확히 한 번 포함해 주세요."}}if(Q.some(At=>!He.some(Pe=>Pe.subject===At)))return');

const encoded = zlib.gzipSync(Buffer.from(source, 'utf8'), { level: 9, mtime: 0 }).toString('base64');
const lines = encoded.match(/.{1,128}/g).join('\n');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + lines + '\n' + match[3]));
console.log(`Updated embedded app bundle (${source.length} characters)`);
