import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppUpdateNotice } from './components/AppUpdateNotice';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppUpdateNotice />
    <App />
  </StrictMode>
);
