// Israel Railways' mark beside a train's number, so a train chip says whose it is (Gadi, 2026-10-25), and what goes
// inside every line chip: the mark for a train, then the line's name. Defined once here for the Preact chips
// (LineName) and the HTML ones on the map (lineNameHtml).
//
// The mark (only this path) is not AGPL: it is cut out of "Flag of Israel Railways.svg" by Meronim, Wikimedia
// Commons, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Flag_of_Israel_Railways.svg,
// https://creativecommons.org/licenses/by-sa/3.0/). Changes: the railway mark alone, traced from the 1280 px rendering
// into one path on a 24-unit-wide box, drawn in the chip's text colour. This path is shared under CC BY-SA 3.0 too.
// The mark is Israel Railways' insignia: it marks their own trains and nothing else.
import { lineText } from '../journey/format';
import { esc } from './html';

const PATH =
  'M12.27 12.48C11.51 11.11 10.55 10.39 9.01 10.05C8.57 9.96 8.42 9.95 5.98 9.93L3.41 9.90L2.70 8.42C2.31 7.60 1.98 6.92 1.98 6.91C1.98 6.90 3.52 6.91 5.40 6.92C9.04 6.94 9.04 6.94 10.05 7.17C12.16 7.67 13.74 8.78 14.99 10.65C15.28 11.09 16.11 12.67 16.11 12.80C16.11 12.85 15.73 12.86 14.29 12.86L12.47 12.85L12.27 12.48ZM15.26 9.55C14.50 8.54 13.53 7.70 12.43 7.12L12.02 6.90L17.28 6.90L22.54 6.90L22.86 7.57C23.04 7.93 23.37 8.61 23.59 9.08L24.00 9.92L19.77 9.92L15.54 9.92L15.26 9.55ZM1.35 5.76C1.11 5.29 -0.00 2.96 -0.00 2.93C0.00 2.90 1.87 2.89 4.21 2.89L8.41 2.89L8.68 3.26C9.40 4.22 10.55 5.21 11.59 5.73C11.79 5.83 11.95 5.92 11.95 5.93C11.95 5.94 9.59 5.95 6.70 5.95L1.45 5.95L1.35 5.76ZM15.83 5.91C12.75 5.76 10.50 4.52 8.94 2.12C8.69 1.74 8.00 0.43 7.90 0.15L7.85 0.00L9.68 0.00L11.50 0.00L11.63 0.23C12.41 1.67 13.37 2.42 14.87 2.76C15.29 2.85 15.45 2.86 17.93 2.88L20.54 2.91L21.26 4.39C21.65 5.21 21.97 5.89 21.97 5.92C21.97 5.96 16.79 5.96 15.83 5.91Z';
const VIEWBOX = '0 0 24 12.86';
const isTrain = (routeType?: number | null) => routeType === 2;

/** The mark, in the colour of the text around it. */
const RailLogo = () => (
  <svg class="rlogo" viewBox={VIEWBOX} aria-hidden="true">
    <path fill="currentColor" d={PATH} />
  </svg>
);
/** A line's name in a chip: the mark first for a train. `text` replaces the name (several lines: "285 / 287"). */
export const LineName = ({
  line,
  routeType,
  text,
}: {
  line?: string | null;
  routeType?: number | null;
  text?: string;
}) => (
  <>
    {isTrain(routeType) && <RailLogo />}
    <bdi>{text ?? lineText(line)}</bdi>
  </>
);
/** The same as HTML, for the chips built as strings (the map's bubbles and line labels). */
export const lineNameHtml = (line: string | null | undefined, routeType?: number | null): string =>
  (isTrain(routeType)
    ? `<svg class="rlogo" viewBox="${VIEWBOX}" aria-hidden="true"><path fill="currentColor" d="${PATH}"/></svg>`
    : '') + `<bdi>${esc(lineText(line))}</bdi>`;
