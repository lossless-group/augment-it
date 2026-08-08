// Standalone entry. theme.css first — it defines the :root tokens and all three
// mode blocks; mode-switcher applies the stored data-mode on import.
import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('root') ?? document.body });
