// Hand-drawn style inline SVG icons. Sketchy, slightly wobbly strokes drawn
// with currentColor so they follow the ink/paper theme. Injected via el()'s
// `html` attribute (decorative — buttons carry their own aria-labels).

const svg = (inner) =>
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  inner + '</svg>';

export const ICONS = {
  // settings sliders: three wavy fader rails, each with a wobbly round knob
  gear: svg(
    '<path d="M4 6.5l8.6-.1"/><path d="M17.4 6.4l2.6.1"/>' +
    '<path d="M15 4.2c1.3-.1 2.4 1 2.3 2.3.1 1.3-1 2.4-2.3 2.3-1.3.1-2.3-1-2.3-2.3 0-1.3 1-2.4 2.3-2.3z"/>' +
    '<path d="M4 12l2.1.1"/><path d="M11 12l9-.1"/>' +
    '<path d="M8.6 9.7c1.3-.1 2.4 1 2.3 2.3.1 1.3-1 2.4-2.3 2.3-1.3.1-2.3-1-2.3-2.3 0-1.3 1-2.4 2.3-2.3z"/>' +
    '<path d="M4 17.6l6.5-.1"/><path d="M15.5 17.5l4.5-.1"/>' +
    '<path d="M13.1 15.2c1.3-.1 2.4 1 2.3 2.3.1 1.3-1 2.4-2.3 2.3-1.3.1-2.3-1-2.3-2.3 0-1.3 1-2.4 2.3-2.3z"/>'
  ),
  // dumbbell: wavy bar + two plates each side
  dumbbell: svg(
    '<path d="M8.3 11.9c2.5.2 5-.1 7.5.1"/>' +
    '<path d="M6.4 8.6l-.2 6.9"/><path d="M4.3 9.9l-.1 4.4"/>' +
    '<path d="M17.7 8.5l.2 7"/><path d="M19.8 9.8l.1 4.5"/>'
  ),
  // spyglass: wobbly lens + handle + inner glint (preview)
  spyglass: svg(
    '<path d="M10.4 3.9c3.6-.2 6.7 2.9 6.5 6.5.2 3.6-2.9 6.6-6.5 6.5-3.6.1-6.6-2.9-6.5-6.5-.1-3.6 2.9-6.7 6.5-6.5z"/>' +
    '<path d="M15.4 15.6c1.7 1.6 3.3 3.3 4.9 5"/>' +
    '<path d="M7.7 8.3c.5-.9 1.4-1.6 2.4-1.8"/>'
  ),
  // flexing bicep (normal mode)
  muscle: svg(
    '<path d="M4.8 19.5c-.3-3.1.1-6.1 1.2-9 .8-2 1.9-3.8 3.4-5.3"/>' +
    '<path d="M9.4 5.2l3 1.8c-.8 1.3-1.3 2.6-1.6 4.1"/>' +
    '<path d="M10.8 11.1c1.7-1.6 4.2-1.9 6.2-.7 2 1.2 3 3.4 2.5 5.6-.4 1.7-1.5 3-3.2 3.7"/>' +
    '<path d="M4.9 19.6c3.7.5 7.4.6 11.3.1"/>'
  ),
  // running shoe (circuit mode)
  shoe: svg(
    '<path d="M3.3 16.8c-.1-2.3.1-4.5.6-6.7 1.6.1 3 .8 4.1 2 1.1 1.1 2.5 1.8 4 2.2 2.5.6 4.9 1.5 7 2.9"/>' +
    '<path d="M3.2 16.9c5.9.4 11.8.6 17.7.4.1-1.3-.5-2.2-1.9-2.7"/>' +
    '<path d="M8.9 12.9l1.5-1.5"/><path d="M11.3 14.3l1.5-1.4"/>' +
    '<path d="M3.4 19.4c5.8.3 11.6.4 17.4.2"/>'
  ),
  // crossed swords (challenge — like the reference mock's sword)
  swords: svg(
    '<path d="M5.1 5c3.4 3.3 6.7 6.7 10 10.1"/>' +
    '<path d="M18.9 5.2c-3.3 3.3-6.6 6.6-9.9 10"/>' +
    '<path d="M13.5 17.5l4.1-4.2"/><path d="M6.4 13.3l4.1 4.2"/>' +
    '<path d="M16.1 18.1l2.7 2.7"/><path d="M7.9 18.1l-2.7 2.7"/>'
  ),
  // play-in-circle (technique video)
  play: svg(
    '<path d="M12 3.4c4.7-.2 8.8 3.9 8.6 8.6.2 4.7-3.9 8.8-8.6 8.6-4.7.2-8.7-3.9-8.6-8.6-.1-4.7 3.9-8.8 8.6-8.6z"/>' +
    '<path d="M10 8.9c1.9 1 3.7 2 5.3 3.1-1.6 1.1-3.4 2.1-5.3 3.1.1-2.1.1-4.1 0-6.2z"/>'
  ),
  // stretching figure: arms reaching up, legs apart (home stretch button,
  // notification icon — rasterized copies live in assets/icons/*.png)
  stretch: svg(
    '<path d="M12 2.7c1.2-.1 2.1.9 2 2.1.1 1.1-.8 2.1-2 2-1.2.1-2.1-.9-2-2-.1-1.2.8-2.2 2-2.1z"/>' +
    '<path d="M12 7c.1 2.2.1 4.4 0 6.6"/>' +
    '<path d="M11.9 9.3c-1.9-1.2-3.5-2.8-4.9-4.6"/><path d="M12.1 9.3c1.9-1.2 3.5-2.8 4.9-4.6"/>' +
    '<path d="M12 13.6c-1.4 2.4-2.8 4.8-4.3 7.1"/><path d="M12 13.6c1.4 2.4 2.8 4.8 4.3 7.1"/>'
  ),
  // ---- settings rows (replace the old emoji) ----
  // sun: wobbly disc + eight short rays (light theme)
  sun: svg(
    '<path d="M12 8.2c2.1-.1 3.9 1.7 3.8 3.8.1 2.1-1.7 3.9-3.8 3.8-2.1.1-3.9-1.7-3.8-3.8-.1-2.1 1.7-3.9 3.8-3.8z"/>' +
    '<path d="M12 2.8l.1 2.4"/><path d="M12 18.8l.1 2.4"/><path d="M2.8 12l2.4.1"/><path d="M18.8 12l2.4.1"/>' +
    '<path d="M5.5 5.5l1.7 1.7"/><path d="M16.8 16.8l1.7 1.7"/><path d="M18.5 5.5l-1.7 1.7"/><path d="M7.2 16.8l-1.7 1.7"/>'
  ),
  // crescent moon (dark theme)
  moon: svg(
    '<path d="M14.8 3.2c-5.2 1.1-8.6 6-7.5 11.1.8 3.6 3.8 6.1 7.8 6.3-2.1 1.3-4.7 1.6-7.1.7-4.3-1.6-6.5-6.4-4.9-10.7 1.5-4.1 5.8-6.9 11.7-7.4z"/>'
  ),
  // speaker + two sound arcs (sound on)
  speaker: svg(
    '<path d="M4.2 9.6c1.4-.1 2.8-.1 4.2 0 1.6-1.6 3.2-3.2 4.9-4.7.1 4.7.1 9.5 0 14.2-1.7-1.5-3.3-3.1-4.9-4.7-1.4.1-2.8.1-4.2 0-.1-1.6-.1-3.2 0-4.8z"/>' +
    '<path d="M16.4 9.4c1.3 1.7 1.3 3.5 0 5.2"/><path d="M18.7 7c2.4 3.3 2.4 6.7 0 10"/>'
  ),
  // speaker + cross (sound off)
  speakerOff: svg(
    '<path d="M4.2 9.6c1.4-.1 2.8-.1 4.2 0 1.6-1.6 3.2-3.2 4.9-4.7.1 4.7.1 9.5 0 14.2-1.7-1.5-3.3-3.1-4.9-4.7-1.4.1-2.8.1-4.2 0-.1-1.6-.1-3.2 0-4.8z"/>' +
    '<path d="M16.6 9.6c1.5 1.5 2.9 3.1 4.4 4.6"/><path d="M21 9.6c-1.5 1.5-2.9 3.1-4.4 4.6"/>'
  ),
  // phone with motion arcs (haptics)
  vibrate: svg(
    '<path d="M8.6 3.4c2.3-.1 4.5-.1 6.8 0 .2 5.8.2 11.5 0 17.3-2.3.1-4.5.1-6.8 0-.2-5.8-.2-11.5 0-17.3z"/>' +
    '<path d="M10.8 17.4l2.4.1"/>' +
    '<path d="M5.2 8.4c-1 2.4-1 4.8 0 7.2"/><path d="M2.6 9.6c-.6 1.6-.6 3.2 0 4.8"/>' +
    '<path d="M18.8 8.4c1 2.4 1 4.8 0 7.2"/><path d="M21.4 9.6c.6 1.6.6 3.2 0 4.8"/>'
  ),
  // dial with needle (intensity)
  gauge: svg(
    '<path d="M3.6 16.4c-.5-4.9 3.3-9.1 8.2-9.3 5-.2 9.1 3.7 8.7 8.7"/>' +
    '<path d="M12.2 16.2c1.4-1.8 2.8-3.6 4.1-5.5"/>' +
    '<path d="M12 15.6c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2z"/>' +
    '<path d="M6.5 11.3l1.3.9"/><path d="M12 7.3l.1 1.6"/><path d="M17.5 11.3l-1.3.9"/>'
  ),
  // bell (reminder)
  bell: svg(
    '<path d="M6.1 16.8c.6-2.2.8-4.4.7-6.6-.1-2.9 2.3-5.4 5.2-5.4 2.9 0 5.3 2.5 5.2 5.4-.1 2.2.1 4.4.7 6.6-3.9.4-7.9.4-11.8 0z"/>' +
    '<path d="M10 19.3c.9 1.3 3.1 1.3 4 0"/>' +
    '<path d="M12 2.9l.1 1.9"/>'
  ),
  // tray + arrow out (export)
  export: svg(
    '<path d="M4.4 14.2c-.1 2.1 0 4.1.1 6.2 5 .2 10 .2 15 0 .1-2.1.2-4.1.1-6.2"/>' +
    '<path d="M12 3.6c.1 4.3.1 8.6 0 12.9"/>' +
    '<path d="M8.2 7.6c1.3-1.4 2.5-2.7 3.8-4 1.3 1.3 2.5 2.6 3.8 4"/>'
  ),
  // tray + arrow in (import)
  import: svg(
    '<path d="M4.4 14.2c-.1 2.1 0 4.1.1 6.2 5 .2 10 .2 15 0 .1-2.1.2-4.1.1-6.2"/>' +
    '<path d="M12 3.4c.1 4.3.1 8.6 0 12.9"/>' +
    '<path d="M8.2 12.3c1.3 1.4 2.5 2.7 3.8 4 1.3-1.3 2.5-2.6 3.8-4"/>'
  ),
  // two overlapping sheets (copy to clipboard)
  copy: svg(
    '<path d="M8.6 8.4c3-.1 6-.1 9 0 .1 3.2.1 6.4 0 9.6-3 .1-6 .1-9 0-.1-3.2-.1-6.4 0-9.6z"/>' +
    '<path d="M6.3 15.5c-.2-3-.2-6.1 0-9.1 3-.2 6-.2 9 0"/>'
  ),
};
