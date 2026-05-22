// theme.css provides the token system + base body rules; mode-switcher
// applies the stored data-mode so standalone (:3002) themes correctly.
// Both load before app.css so the component styles' var() refs resolve.
import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('root');
if (!target) throw new Error('no #root');

mount(App, { target });
