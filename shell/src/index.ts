// theme.css first — it defines the :root tokens every component's var()
// resolves against, plus the base body rules. Must load before App.svelte's
// styles. mode-switcher applies the stored data-mode on import.
import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('root');
if (!target) throw new Error('no #root');

mount(App, { target });
