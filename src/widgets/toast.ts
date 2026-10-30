// A short message at the bottom of the screen.
let timer = 0;
export function toast(msg: string, ms = 2500): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    el.hidden = true;
  }, ms);
}
