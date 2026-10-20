// Wayli's mark (two stops and the way between them) in the theme's own turquoise, so it changes with light and
// dark like everything else; the mark itself takes the colour the app's filled buttons use for their text.
// The colours come from the stylesheet (.logo .bg, .logo .mark).
export const Logo = () => (
  <svg class="logo" viewBox="0 0 512 512" aria-hidden="true">
    <circle class="bg" cx="256" cy="256" r="256" />
    <g class="mark">
      <path d="M155 348 358 162" stroke-width="76" stroke-linecap="round" />
      <circle cx="155" cy="348" r="57" />
      <circle cx="358" cy="162" r="57" />
    </g>
  </svg>
);
