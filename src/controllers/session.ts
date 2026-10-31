// One panel's session: what the panel shows now (a stop, a line, the trains between two stations, a journey). Opening
// it again begins a new session; an answer that comes back for an older one is dropped; the session's repeating poll
// stops with it. The four panels used to keep this by hand (a counter, a timer, the same checks in every function).
export type Session = {
  /** A new session: the old one's poll stops; the token says which session an answer belongs to. */
  begin(): number;
  /** Whether `token` is still the session shown. */
  isCurrent(token: number): boolean;
  /** The session shown now (for work that continues it). */
  current(): number;
  /** The session's repeating timer (a livePoll's, or whileVisible's): stopped with the session. */
  poll(timer: number): void;
  /** The panel closed: answers still on their way are dropped, the poll stops. */
  end(): void;
};
export function panelSession(): Session {
  let seq = 0,
    timer = 0;
  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };
  return {
    begin() {
      stop();
      return ++seq;
    },
    isCurrent: (token) => token === seq,
    current: () => seq,
    poll(t) {
      stop();
      timer = t;
    },
    end() {
      stop();
      seq++;
    },
  };
}
/** `fn` every `ms` while the page is in view: a poll that pauses while the phone is put away. Returns the timer. */
export const whileVisible = (fn: () => void, ms: number): number =>
  window.setInterval(() => {
    if (!document.hidden) fn();
  }, ms);
