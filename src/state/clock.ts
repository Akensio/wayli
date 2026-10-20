// A clock the countdowns read: it ticks every 20 seconds, so a component that reads it re-renders then.
import { signal } from '@preact/signals';

export const now = signal(Date.now());
setInterval(() => { now.value = Date.now(); }, 20000);
