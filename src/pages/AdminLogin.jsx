/**
 * AdminLogin.jsx — Trang đăng nhập quản trị (port y hệt login-current.html).
 *
 * - Lần đầu (chưa có hash) hiện form đặt mật khẩu (nhập 2 lần, >= 6 ký tự).
 * - Đã có hash thì form đăng nhập; đúng -> markAdminLoggedIn() rồi chuyển
 *   sang admin/index.html (window.location.replace).
 * - Đã đăng nhập rồi thì tự chuyển thẳng.
 * - Mật khẩu lưu dạng băm SHA-256 (qua lib/auth.js); chỉ là khoá giao diện,
 *   chưa phải bảo mật thật vì hệ thống không có backend.
 */
import { useEffect, useRef, useState } from 'react';
import {
  hasAdminPassword,
  checkAdminPassword,
  setAdminPassword,
  isAdminLoggedIn,
  markAdminLoggedIn,
} from '../lib/auth.js';
import { Icon } from '../lib/icons.jsx';

export default function AdminLogin() {
  // mode: null = đang kiểm tra, 'login' = đã có mật khẩu, 'setup' = lần đầu
  const [mode, setMode] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    // Đã đăng nhập rồi thì vào thẳng dashboard.
    if (isAdminLoggedIn()) {
      window.location.replace('index.html');
      return;
    }
    setMode(hasAdminPassword() ? 'login' : 'setup');
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function enterDashboard() {
    markAdminLoggedIn();
    window.location.replace('index.html');
  }

  function showError(msg) {
    setError(msg);
    setOk('');
  }

  function showOk(msg) {
    setOk(msg);
    setError('');
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!password) {
      showError('Vui lòng nhập mật khẩu.');
      return;
    }
    setBusy(true);
    try {
      const valid = await checkAdminPassword(password);
      if (valid) {
        enterDashboard();
      } else {
        showError('Mật khẩu không đúng. Vui lòng thử lại.');
      }
    } catch (err) {
      showError('Có lỗi khi kiểm tra mật khẩu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(e) {
    e.preventDefault();
    if (newPassword.length < 6) {
      showError('Mật khẩu phải có tối thiểu 6 ký tự.');
      return;
    }
    if (newPassword !== newPassword2) {
      showError('Hai lần nhập mật khẩu chưa khớp nhau.');
      return;
    }
    setBusy(true);
    try {
      const result = await setAdminPassword(newPassword, newPassword2);
      if (!result.ok) {
        showError(result.error || 'Có lỗi khi lưu mật khẩu. Vui lòng thử lại.');
        setBusy(false);
        return;
      }
      showOk('Đã đặt mật khẩu. Đang chuyển vào trang quản trị…');
      timerRef.current = setTimeout(enterDashboard, 500);
    } catch (err) {
      showError('Có lỗi khi lưu mật khẩu. Vui lòng thử lại.');
      setBusy(false);
    }
  }

  if (mode === null) return null;

  const isSetup = mode === 'setup';

  return (
    <div className="login-page">
      <main className="login">
        <div className="login__logo">
          <Icon name="heart" size={46} />
        </div>
        <h1 className="login__title">
          {isSetup ? 'Đặt mật khẩu quản trị' : 'Đăng nhập quản trị'}
        </h1>
        <p className="login__subtitle">Khu vực quản trị thiệp cưới online</p>

        <div className={`login__error${error ? ' is-show' : ''}`} role="alert">
          {error}
        </div>
        <div className={`login__ok${ok ? ' is-show' : ''}`} role="status">
          {ok}
        </div>

        {!isSetup && (
          <form id="loginForm" noValidate onSubmit={handleLogin}>
            <div className="login__field">
              <label className="login__label" htmlFor="password">
                Mật khẩu quản trị
              </label>
              <input
                className="login__input"
                type="password"
                id="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="login__btn" type="submit" disabled={busy}>
              {busy ? 'Đang kiểm tra…' : 'Đăng nhập'}
            </button>
          </form>
        )}

        {isSetup && (
          <form id="setupForm" noValidate onSubmit={handleSetup}>
            <div className="login__field">
              <label className="login__label" htmlFor="newPassword">
                Mật khẩu mới (tối thiểu 6 ký tự)
              </label>
              <input
                className="login__input"
                type="password"
                id="newPassword"
                autoComplete="new-password"
                placeholder="Nhập mật khẩu mới"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="login__field">
              <label className="login__label" htmlFor="newPassword2">
                Nhập lại mật khẩu mới
              </label>
              <input
                className="login__input"
                type="password"
                id="newPassword2"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                required
                minLength={6}
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
              />
            </div>
            <button className="login__btn" type="submit" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Đặt mật khẩu & vào quản trị'}
            </button>
          </form>
        )}

        <p className="login__hint">
          {isSetup
            ? 'Đây là lần đầu bạn vào trang quản trị. Hãy đặt một mật khẩu (tối thiểu 6 ký tự).'
            : 'Lần đầu vào trang này, bạn sẽ được yêu cầu đặt mật khẩu mới.'}
        </p>

        <div className="login__note">
          <Icon name="alert" size={15} /> <strong>Lưu ý bảo mật:</strong> Đây chỉ là
          khoá giao diện, chưa phải bảo mật thật vì hệ thống không có backend — ai
          biết mở DevTools cũng có thể qua được. Không dùng cho dữ liệu nhạy cảm.
        </div>
        <a className="login__back" href="../index.html">
          <Icon name="arrowLeft" size={14} /> Quay lại xem thiệp
        </a>
      </main>
    </div>
  );
}
