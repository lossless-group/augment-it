// Federation-exposed mount. The shared body lives in @augment-it/federation,
// which also carries the theme.css import — see that module for why the
// ordering below (federation first, ./app.css second) is load-bearing.

import { makeMount } from '@augment-it/federation';
import './app.css';
import type { Component } from 'svelte';
import App from './App.svelte';

export type { MountResult } from '@augment-it/federation';

export const mountRecordDbResolver = makeMount(App as Component);
