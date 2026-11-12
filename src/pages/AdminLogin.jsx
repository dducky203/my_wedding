import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, loginAdmin } from '../lib/auth.js';
import { Icon } from '../lib/icons.jsx';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (user) window.location.replace('index.html');
  }), []);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }

    setBusy(true);
    try {
      await loginAdmin(email, password);
      window.location.replace('index.html');
    } catch (err) {
      if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(err.code)) {
        setError('Email hoặc mật khẩu không đúng.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Hãy bật phương thức Email/Password trong Firebase Authentication.');
      } else {
        console.error('[admin-login] Đăng nhập thất bại:', err);
        setError(err.message || 'Không thể đăng nhập. Hãy kiểm tra cấu hình Firebase.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <main className="login">
        <div className="login__logo">
          <Icon name="heart" size={46} />
        </div>
        <h1 className="login__title">Đăng nhập quản trị</h1>
        <p className="login__subtitle">Khu vực quản trị thiệp cưới online</p>

        <div className={`login__error${error ? ' is-show' : ''}`} role="alert">
          {error}
        </div>

        <form id="loginForm" noValidate onSubmit={handleLogin}>
          <div className="login__field">
            <label className="login__label" htmlFor="email">Email quản trị</label>
            <input
              className="login__input"
              type="email"
              id="email"
              autoComplete="username"
              placeholder="admin@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="login__field">
            <label className="login__label" htmlFor="password">Mật khẩu</label>
            <input
              className="login__input"
              type="password"
              id="password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="login__btn" type="submit" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        <p className="login__hint">
          Tài khoản quản trị được tạo trong Firebase Console, không đăng ký từ trang này.
        </p>

        <div className="login__note">
          <Icon name="alert" size={15} /> <strong>Lưu ý bảo mật:</strong> Quyền quản trị
          được kiểm tra bằng Firebase Authentication và Firestore Rules.
        </div>
        <a className="login__back" href="../index.html">
          <Icon name="arrowLeft" size={14} /> Quay lại xem thiệp
        </a>
      </main>
    </div>
  );
}
