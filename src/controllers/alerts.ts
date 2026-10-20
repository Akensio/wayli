// Alerts while following a trip: vibration, three beeps and a notification (through the service worker, so a
// tap reopens the app), and always a toast.
import { settings } from '../store.js';
import { t, lang } from '../i18n';
import { toast } from '../ui/toast';

let audio: AudioContext | null = null;
/** Audio may only start from a tap: called when a trip starts, so the beeps can play later. */
export function ensureAudio(): void { try { if (!audio && window.AudioContext) audio = new AudioContext(); if (audio && audio.state === 'suspended') audio.resume(); } catch { /* no audio */ } }
function beep(): void {
  if (!audio) return;
  try {
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      const t0 = audio.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.start(t0); o.stop(t0 + 0.3);
    }
  } catch { /* no audio */ }
}
export async function requestAlertPermission(): Promise<void> {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* refused */ } }
  if (Notification.permission === 'denied') toast(t('alertPermNo'));
}
export function alertUser(title: string, body: string): void {
  const s = settings.get();
  if (s.sound) { try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 700]); } catch { /* no vibration */ } beep(); }
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') {
    const opts = { body, tag: 'wayli-trip', renotify: true, vibrate: [400, 150, 400], icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: lang.value } as NotificationOptions;
    const direct = () => { try { new Notification(title, opts); } catch { /* not allowed here */ } };
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then((reg) => (reg && reg.showNotification ? reg.showNotification(title, opts) : direct())).catch(direct);
    else direct();
  }
  toast(`${title}${body ? ' · ' + body : ''}`, 7000);
}
