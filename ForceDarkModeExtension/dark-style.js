const DARK_CSS = `
  :root,
  html[data-force-dark-mode="true"] {
    color-scheme: dark !important;
  }

  html,
  body {
    background: #111318 !important;
    color: #e8ecf3 !important;
  }

  body {
    background-color: #111318 !important;
    color: #e8ecf3 !important;
  }

  body *:not(img):not(video):not(canvas):not(svg):not(path):not([style*="background-image"]) {
    background-color: #111318 !important;
  }

  body *,
  body *::before,
  body *::after {
    border-color: #3a4150 !important;
    color: #e8ecf3 !important;
    outline-color: #5b6475 !important;
    text-decoration-color: #9aa5b7 !important;
    -webkit-text-fill-color: #e8ecf3 !important;
    text-shadow: none !important;
  }

  a,
  a *,
  a::before,
  a::after {
    color: #8cc8ff !important;
    -webkit-text-fill-color: #8cc8ff !important;
  }

  input,
  textarea,
  select,
  button,
  [contenteditable="true"] {
    background-color: #1b1f29 !important;
    border-color: #4b5568 !important;
    color: #f8fafc !important;
    -webkit-text-fill-color: #f8fafc !important;
  }

  ::placeholder {
    color: #aeb6c8 !important;
    -webkit-text-fill-color: #aeb6c8 !important;
  }

  table,
  thead,
  tbody,
  tr,
  td,
  th {
    background-color: #111318 !important;
    border-color: #3a4150 !important;
  }

  code,
  pre,
  kbd,
  samp {
    background-color: #1d2430 !important;
    color: #f8fafc !important;
    -webkit-text-fill-color: #f8fafc !important;
  }

  img,
  video,
  picture,
  canvas {
    filter: brightness(0.86) contrast(1.08) !important;
  }

  svg,
  svg * {
    color: #e8ecf3 !important;
    text-shadow: none !important;
  }

  svg path:not([fill="none"]),
  svg rect:not([fill="none"]),
  svg circle:not([fill="none"]),
  svg ellipse:not([fill="none"]),
  svg polygon:not([fill="none"]),
  svg polyline:not([fill="none"]),
  svg line:not([fill="none"]),
  svg text:not([fill="none"]) {
    fill: currentColor !important;
  }

  svg path:not([stroke="none"]),
  svg rect:not([stroke="none"]),
  svg circle:not([stroke="none"]),
  svg ellipse:not([stroke="none"]),
  svg polygon:not([stroke="none"]),
  svg polyline:not([stroke="none"]),
  svg line:not([stroke="none"]) {
    stroke: currentColor !important;
  }

  [class*="icon" i],
  [class*="logo" i],
  [class*="symbol" i],
  [class*="glyph" i],
  [aria-hidden="true"] {
    color: #f1f5f9 !important;
    fill: currentColor !important;
    stroke: currentColor !important;
    -webkit-text-fill-color: #f1f5f9 !important;
  }

  img[data-force-dark-icon="true"],
  svg[data-force-dark-icon="true"],
  [data-force-dark-decor="true"] {
    filter: invert(1) hue-rotate(180deg) brightness(1.14) contrast(1.04) !important;
  }
`;
