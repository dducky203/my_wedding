import React from 'react';
import ReactDOM from 'react-dom/client';
import PublicPage from './pages/PublicPage.jsx';
import './styles/site.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PublicPage />
  </React.StrictMode>,
);
