import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { startApp } from './app';
import { initConnectionPill } from './components/connection-pill.ts';
import { initPwaInstallPrompt } from './utils/pwa';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

initConnectionPill();
initPwaInstallPrompt();
startApp(root);

if (import.meta.env.PROD) {
  const isRunActive = () => !!document.querySelector('.RunShell.running');
  let pendingUpdate = false;
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

  const applyUpdateIfSafe = () => {
    if (!pendingUpdate) return;
    if (isRunActive()) return;
    pendingUpdate = false;
    if (updateSW) {
      void updateSW(true);
    }
  };

  updateSW = registerSW({
    onNeedRefresh: () => {
      pendingUpdate = true;
      applyUpdateIfSafe();
    },
  });
  applyUpdateIfSafe();

  const handleVisibilityUpdate = () => {
    if (document.visibilityState === 'visible') {
      applyUpdateIfSafe();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityUpdate);
  window.addEventListener('focus', applyUpdateIfSafe);
  document.addEventListener('wodbrains:run-status', (event) => {
    if (!(event instanceof CustomEvent)) return;
    const status = event.detail?.status;
    if (status && status !== 'running') {
      applyUpdateIfSafe();
    }
  });
}
