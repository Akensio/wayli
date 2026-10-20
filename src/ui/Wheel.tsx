// A wheel of values, like an alarm clock's: a column that scrolls and snaps, the value at the centre chosen.
// A tap on a value turns the wheel to it; the arrow keys step it. The value is reported once the wheel rests.
import { useEffect, useRef, useState } from 'preact/hooks';

export const ROW = 36;    // px: one value
const VISIBLE = 5;        // values in view, the chosen one in the middle
type Item = { key: string; label: string };
type Props = { id: string; label: string; items: Item[]; value: string; onChange: (key: string) => void; class?: string };

export function Wheel({ id, label, items, value, onChange, class: cls = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const [centre, setCentre] = useState(index);   // the value under the band while the wheel turns
  // the wheel follows a value set from outside (another wheel, "now"), unless a finger is turning it
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
    setCentre(index);
  }, [index, items.length]);
  const onScroll = () => {
    const el = ref.current!; const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ROW)));
    setCentre(i);
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => { if (items[i] && items[i].key !== value) onChange(items[i].key); }, 140);
  };
  const turnTo = (i: number) => { const el = ref.current; if (!el) return; const j = Math.max(0, Math.min(items.length - 1, i)); el.scrollTo({ top: j * ROW, behavior: 'smooth' }); };
  return (
    <div ref={ref} class={`wheel ${cls}`} id={id} role="listbox" aria-label={label} tabIndex={0} style={{ height: `${ROW * VISIBLE}px`, paddingBlock: `${ROW * 2}px` }}
      aria-activedescendant={`${id}-${items[centre]?.key}`} onScroll={onScroll}
      onKeyDown={(e) => { if (e.key === 'ArrowDown') { turnTo(centre + 1); e.preventDefault(); } else if (e.key === 'ArrowUp') { turnTo(centre - 1); e.preventDefault(); } }}>
      {items.map((it, i) => (
        <div class={`wheel-item${i === centre ? ' on' : ''}`} id={`${id}-${it.key}`} data-key={it.key} role="option" aria-selected={i === centre} style={{ height: `${ROW}px`, lineHeight: `${ROW}px` }} onClick={() => turnTo(i)}>{it.label}</div>
      ))}
    </div>
  );
}
