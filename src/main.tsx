import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// רישום Service Worker — נדרש כדי שהמכשיר יזהה את האתר כאפליקציה
// וייתן להתקין אותו על מסך הבית.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[PWA] Service Worker נרשם', reg.scope))
      .catch((err) => console.warn('[PWA] רישום נכשל:', err));
  });
}
