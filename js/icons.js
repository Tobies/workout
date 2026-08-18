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
};
