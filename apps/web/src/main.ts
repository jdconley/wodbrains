import './style.css';
import { startApp } from './app';
import { initConnectionPill } from './components/connection-pill.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

initConnectionPill();
startApp(root);
