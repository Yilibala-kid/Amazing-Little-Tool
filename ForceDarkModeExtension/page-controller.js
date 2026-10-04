// executeScript serializes this function: keep all page dependencies inside it.
function controlPageDarkMode({ styleId, css, enabled }) {
  const root = document.documentElement;
  const style = document.getElementById(styleId);
  if (enabled === undefined) return Boolean(style);

  if (!enabled) {
    style?.remove();
    delete root.dataset.forceDarkMode;
    document.querySelectorAll('[data-force-dark-icon], [data-force-dark-decor]').forEach(element => {
      delete element.dataset.forceDarkIcon;
      delete element.dataset.forceDarkDecor;
    });
    return false;
  }

  const isSmallVisual = element => {
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.naturalWidth || 0;
    const height = rect.height || element.naturalHeight || 0;
    return width > 0 && height > 0 && width <= 128 && height <= 128;
  };

  // Measure the original page before adding rules that modify its appearance.
  document.querySelectorAll('img, svg').forEach(element => {
    if (isSmallVisual(element)) element.dataset.forceDarkIcon = 'true';
  });
  document.querySelectorAll('body *').forEach(element => {
    const background = getComputedStyle(element).backgroundImage;
    if (background && background !== 'none' &&
        (isSmallVisual(element) || /icon|logo|symbol|glyph|avatar/i.test(String(element.className || '')))) {
      element.dataset.forceDarkDecor = 'true';
    }
  });
  if (!style) {
    const sheet = document.createElement('style');
    sheet.id = styleId;
    sheet.textContent = css;
    root.appendChild(sheet);
  }
  root.dataset.forceDarkMode = 'true';
  return true;
}
