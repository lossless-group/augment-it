// Standalone dev entrypoint for the chat remote. The shell mounts via
// ./mount.ts in federation mode; this file is what `rsbuild dev`
// serves at http://localhost:3006/ for working on the surface in
// isolation.

import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('root');
if (!target) throw new Error('no #root');

mount(App, { target });
