// Server-reported version; this component is outside every printable form.
function VersionInfo({ version }) {
  return (0, w.jsx)('div', {
    className: 'app-version-bar no-print', 'aria-label': '사용 중인 프로그램 버전',
    children: version ? '프로그램 버전 ' + version : '버전 정보를 불러오는 중…',
  });
}
function UpdateNotice() {
  const [notice, setNotice] = ke.useState(null);
  const [busy, setBusy] = ke.useState(false);
  const [dismissed, setDismissed] = ke.useState('');
  const lastCheck = ke.useRef(0), running = ke.useRef(false), mounted = ke.useRef(false);
  const check = async (refresh = false) => {
    if (running.current) return;
    running.current = true; setBusy(true);
    try {
      const result = await fetch('/api/update-notice', { method: refresh ? 'POST' : 'GET' });
      if (!mounted.current) return;
      if (result.status === 401 || result.status === 403) { setNotice(null); return; }
      if (!result.ok) throw Error('업데이트 조회 실패');
      const value = await result.json();
      if (!mounted.current) return;
      setNotice(value);
      lastCheck.current = Date.now();
      let hidden = '';
      try { if (sessionStorage.getItem('textbook-update-dismissed:' + value.latestVersion)) hidden = value.latestVersion; } catch {}
      setDismissed(refresh ? '' : hidden);
    } catch {
      // A failed request never claims that this installation is up to date.
      if (mounted.current) setNotice(previous => previous ? { ...previous, checkStatus: 'unavailable' } : null);
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  ke.useEffect(() => {
    mounted.current = true;
    check();
    const recheck = () => { if (!document.hidden && Date.now() - lastCheck.current >= 3600000) check(); };
    const timer = setInterval(recheck, 3600000);
    document.addEventListener('visibilitychange', recheck);
    return () => { mounted.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', recheck); };
  }, []);
  if (!notice) return null;
  const available = notice.updateAvailable && dismissed !== notice.latestVersion;
  const status = notice.checkStatus === 'unavailable' ? '업데이트를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.' : notice.updateAvailable ? '새 업데이트가 있습니다.' : '새 업데이트가 없습니다.';
  return (0, w.jsxs)('section', { className: 'program-update-panel no-print', 'aria-label': '프로그램 업데이트', children: [
    (0, w.jsxs)('div', { className: 'program-update-check', children: [
      (0, w.jsx)('span', { role: 'status', children: busy ? '업데이트 확인 중…' : status }),
      notice.checkedAt && (0, w.jsx)('small', { children: '최근 확인: ' + new Date(notice.checkedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) }),
      (0, w.jsx)('button', { type: 'button', disabled: busy, onClick: () => check(true), children: '업데이트 확인' }),
    ] }),
    available && (0, w.jsxs)('aside', { className: 'program-update-banner', role: 'status', children: [
      (0, w.jsx)('strong', { children: '새 버전 ' + notice.latestVersion + '이 나왔습니다.' }),
      (0, w.jsx)('p', { children: '현재 ' + notice.currentVersion + ' · 자동 업데이트는 아닙니다. 전체 백업 후 설치 파일을 교체하고 기존 웹 앱을 새 버전으로 배포해 주세요.' }),
      (0, w.jsx)('a', { href: 'https://github.com/skonT151216/textbook-selection-apps-script/releases/latest', target: '_blank', rel: 'noopener noreferrer', children: '업데이트 내용과 설치 파일 보기' }),
      (0, w.jsx)('button', { type: 'button', onClick: () => { try { sessionStorage.setItem('textbook-update-dismissed:' + notice.latestVersion, '1'); } catch {} setDismissed(notice.latestVersion); }, children: '나중에 보기' }),
    ] }),
  ] });
}
