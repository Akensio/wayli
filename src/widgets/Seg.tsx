// A segmented choice: a row of buttons, one pressed (the bike choice, the settings' look, language, filters). One for
// every place that offers a choice this way.
export function Seg<T extends string>({
  id,
  value,
  options,
  onPick,
}: {
  id: string;
  value: T;
  options: { v: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div class="seg pill" id={id} role="group">
      {options.map((o) => (
        <button type="button" key={o.v} aria-pressed={o.v === value} onClick={() => onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
