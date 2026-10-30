// Alerts while following a trip: vibration, three beeps and a notification (through the service worker, so a
// tap reopens the app), and always a toast. And the trip in the notification bar (tripStatus).
import { settings } from '../lib/store.ts';
import { t, lang } from '../lib/i18n';
import { toast } from '../widgets/toast';

let audio: AudioContext | null = null;
/** Audio may only start from a tap: called when a trip starts, so the beeps can play later. */
export function ensureAudio(): void {
  try {
    if (!audio && window.AudioContext) audio = new AudioContext();
    if (audio && audio.state === 'suspended') audio.resume();
  } catch {
    /* no audio */
  }
}
function beep(): void {
  if (!audio) return;
  try {
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(audio.destination);
      const t0 = audio.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
  } catch {
    /* no audio */
  }
}
export async function requestAlertPermission(): Promise<void> {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* refused */
    }
  }
  if (Notification.permission === 'denied') toast(t('alertPermNo'));
}
export function alertUser(title: string, body: string): void {
  const s = settings.get();
  if (s.sound) {
    try {
      if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 700]);
    } catch {
      /* no vibration */
    }
    beep();
  }
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') {
    const opts = {
      body,
      tag: 'wayli-trip',
      renotify: true,
      vibrate: [400, 150, 400],
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      lang: lang.value,
    } as NotificationOptions;
    const direct = () => {
      try {
        new Notification(title, opts);
      } catch {
        /* not allowed here */
      }
    };
    if (navigator.serviceWorker)
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => (reg && reg.showNotification ? reg.showNotification(title, opts) : direct()))
        .catch(direct);
    else direct();
  }
  toast(`${title}${body ? ' · ' + body : ''}`, 7000);
}

/**
 * The trip in the notification bar while following: how many stops are left and when to get off, silent and updated
 * in place (one tag), gone when the trip ends. A web page gets no position with the phone locked, and the phone
 * pauses it a while after it goes to the background, so the line leads with a clock time ("get off ~22:13"), which
 * stays true when it stops updating, and says when it was last updated. `null` takes it away.
 */
let statusShown = '';
export function tripStatus(title: string | null, body = ''): void {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
  if (title && !settings.get().notify) title = null;
  const key = title ? `${title}|${body}` : '';
  if (key === statusShown) return;
  statusShown = key;
  navigator.serviceWorker
    .getRegistration()
    .then(async (reg) => {
      if (!reg) return;
      if (!title) {
        for (const n of await reg.getNotifications({ tag: 'wayli-status' })) n.close();
        return;
      }
      await reg.showNotification(title, {
        body,
        tag: 'wayli-status',
        renotify: false,
        silent: true,
        requireInteraction: true,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        lang: lang.value,
      } as NotificationOptions);
    })
    .catch(() => {
      /* not allowed here */
    });
}
