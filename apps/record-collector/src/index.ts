import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

// Standalone body styles. Only applied when running on :3002 directly;
// the shell provides its own equivalent when this app is federated.
const STANDALONE_BODY_CSS = `body {
  margin: 0;
  background: #0f1115;
  color: #e8eaf0;
  font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}`;

function ensureStandaloneBodyStyle(): void {
  const id = 'rc-standalone-body';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = STANDALONE_BODY_CSS;
  document.head.appendChild(style);
}

ensureStandaloneBodyStyle();

const target = document.getElementById('root');
if (!target) throw new Error('no #root');

mount(App, { target });
