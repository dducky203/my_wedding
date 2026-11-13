import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PublicPage from './pages/PublicPage.jsx';
import RsvpPage from './pages/RsvpPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import siteCss from './styles/site.css?url';
import adminCss from './styles/admin.css?url';

function App() {
  const location = useLocation();
  const admin = location.pathname.startsWith('/admin');
  React.useEffect(() => {
    if (!admin) document.body.classList.remove('admin--dark');
    window.scrollTo(0, 0);
  }, [location.pathname, admin]);
  return <>
    <link rel="stylesheet" href={admin ? adminCss : siteCss} />
    <Routes>
      <Route path="/" element={<PublicPage />} />
      <Route path="/rsvp" element={<RsvpPage />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/index.html" element={<Navigate to={'/' + location.search} replace />} />
      <Route path="/rsvp.html" element={<Navigate to={'/rsvp' + location.search} replace />} />
      <Route path="/admin/index.html" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/login.html" element={<Navigate to="/admin/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
