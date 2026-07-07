// Standalone entry (:3010). theme.css for tokens + mode-switcher for theme;
// both load before app.css so component styles' var() refs resolve. In the
// shell, mount.ts is the entry instead.
import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('root');
if (!target) throw new Error('no #root');

mount(App, { target });
