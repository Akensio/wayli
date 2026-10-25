// The live mark beside a departure: ⦿ when its vehicle is seen, with how many minutes late (or early) when it is
// not on time, and a ? when the report is old. Green when sure, amber when not.
import { signed } from '../journey/format';

export function LiveMark({ delayMin, stale }: { delayMin?: number | null; stale?: boolean }) {
  return <span class={`live ${stale ? 'unsure' : 'ok'}`}>⦿{delayMin ? ` ${signed(delayMin)}` : ''}{stale ? '?' : ''}</span>;
}
