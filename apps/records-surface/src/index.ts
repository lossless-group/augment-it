import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('root');
if (!target) throw new Error('no #root');
mount(App, { target });
