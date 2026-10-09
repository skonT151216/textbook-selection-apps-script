const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..'), file = path.join(root, 'Index.html');
const wrapper = fs.readFileSync(file, 'utf8'), match = wrapper.match(/(<pre id="app-bundle">)([A-Za-z0-9+/=\s]+)(<\/pre>)/);
let html = zlib.gunzipSync(Buffer.from(match[2].replace(/\s/g, ''), 'base64')).toString();
const helper = fs.readFileSync(path.join(root, 'identity/version-status.js'), 'utf8');
const startMarker = '/* version-status-start */', endMarker = '/* version-status-end */';
if (html.includes(startMarker)) {
  html = html.slice(0, html.indexOf(startMarker)) + startMarker + '\n' + helper + endMarker + html.slice(html.indexOf(endMarker) + endMarker.length);
} else {
  const start = html.indexOf('function UpdateNotice('), end = html.indexOf('function Oee(', start);
  if (start < 0 || end < 0) throw Error('Update component anchor missing');
  html = html.slice(0, start) + startMarker + '\n' + helper + endMarker + html.slice(end);
  const from = html.indexOf('function Oee('), to = html.indexOf('(0,j7.createRoot)', from);
  let component = html.slice(from, to);
  if (!component.includes('},[]),f?') || !component.endsWith('})})}')) throw Error('App shell anchor missing');
  component = component.replace('},[]),f?', '},[]),(0,w.jsxs)(w.Fragment,{children:[(0,w.jsx)(VersionInfo,{version:e&&e.currentVersion}),f?');
  component = component.slice(0, -1) + ']})}';
  html = html.slice(0, from) + component + html.slice(to);
}
const style = '<style id="program-version-style">.app-version-bar{padding:7px 20px;text-align:right;background:#f1f5f9;color:#52657d;font-size:12px;border-bottom:1px solid #dce5ef}.program-update-panel{max-width:1100px;margin:10px auto;padding:0 16px;color:#334155;font-size:13px}.program-update-panel:has(+.app-shell){max-width:none;margin:10px 40px 10px 284px;padding:0}.program-update-check{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.program-update-check small{color:#64748b}.program-update-panel button{cursor:pointer;padding:5px 10px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;color:#294d7b}.program-update-panel button:disabled{opacity:.6;cursor:wait}.program-update-banner{padding:14px 18px;margin-top:10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;line-height:1.6}.program-update-banner p{margin:6px 0}.program-update-banner a{color:#175bc2;font-weight:700;margin-right:16px}@media(max-width:850px){.program-update-panel:has(+.app-shell){margin:10px 14px;padding:0}}@media print{.app-version-bar,.program-update-panel{display:none!important}}</style>';
html = html.includes('id="program-version-style"') ? html.replace(/<style id="program-version-style">[\s\S]*?<\/style>/, style) : html.replace('</head>', style + '</head>');
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
const packed = zlib.gzipSync(Buffer.from(html), { level: 9, mtime: 0 }).toString('base64');
fs.writeFileSync(file, wrapper.replace(match[0], match[1] + '\n' + packed.match(/.{1,128}/g).join('\n') + '\n' + match[3]));
console.log('Embedded server version display and non-blocking update checks');
