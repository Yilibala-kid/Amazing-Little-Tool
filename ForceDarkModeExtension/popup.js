const STYLE_ID = "__force_dark_current_page_style__";
const ICON_MARK = "forceDarkIcon";
const DECOR_MARK = "forceDarkDecor";

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

const statusEl = document.querySelector("#status");
const toggleEl = document.querySelector("#toggle");
let currentTabId = null;
let isEnabled = false;

function setStatus(message) {
  statusEl.textContent = message;
}

function render(enabled) {
  isEnabled = enabled;
  toggleEl.disabled = false;
  toggleEl.textContent = enabled ? "关闭当前页深色模式" : "开启当前页深色模式";
  toggleEl.classList.toggle("is-on", enabled);
  setStatus(enabled ? "当前页面已经启用深色模式。" : "当前页面还没有启用深色模式。");
}

async function runInCurrentTab(func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: {
      tabId: currentTabId,
      allFrames: true
    },
    func,
    args
  });

  return result?.result;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

function readState(styleId) {
  return Boolean(document.getElementById(styleId));
}

function markVisualDetails(iconMark, decorMark) {
  const isSmallVisual = (element) => {
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.naturalWidth || 0;
    const height = rect.height || element.naturalHeight || 0;

    if (!width || !height) {
      return false;
    }

    return width <= 128 && height <= 128;
  };

  document.querySelectorAll("img, svg").forEach((element) => {
    if (isSmallVisual(element)) {
      element.dataset[iconMark] = "true";
    }
  });

  document.querySelectorAll("body *").forEach((element) => {
    const style = getComputedStyle(element);
    const hasBackgroundImage = style.backgroundImage && style.backgroundImage !== "none";
    const className = String(element.className || "");

    if (hasBackgroundImage && (isSmallVisual(element) || /icon|logo|symbol|glyph|avatar/i.test(className))) {
      element.dataset[decorMark] = "true";
    }
  });
}

function enableDarkMode(styleId, css, iconMark, decorMark) {
  let style = document.getElementById(styleId);

  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  document.documentElement.dataset.forceDarkMode = "true";
  markVisualDetails(iconMark, decorMark);
  return true;
}

function disableDarkMode(styleId, iconMark, decorMark) {
  document.getElementById(styleId)?.remove();
  delete document.documentElement.dataset.forceDarkMode;

  document.querySelectorAll(`[data-force-dark-icon], [data-force-dark-decor]`).forEach((element) => {
    delete element.dataset[iconMark];
    delete element.dataset[decorMark];
  });

  return false;
}

async function toggleDarkMode() {
  toggleEl.disabled = true;

  try {
    const enabled = isEnabled
      ? await runInCurrentTab(disableDarkMode, [STYLE_ID, ICON_MARK, DECOR_MARK])
      : await runInCurrentTab(enableDarkMode, [STYLE_ID, DARK_CSS, ICON_MARK, DECOR_MARK]);

    render(Boolean(enabled));
  } catch (error) {
    toggleEl.disabled = false;
    setStatus(`无法修改这个页面：${error.message}`);
  }
}

async function init() {
  try {
    const tab = await getCurrentTab();

    if (!tab?.id) {
      throw new Error("没有找到可用标签页");
    }

    currentTabId = tab.id;
    const enabled = await runInCurrentTab(readState, [STYLE_ID]);
    render(Boolean(enabled));
  } catch (error) {
    toggleEl.disabled = true;
    setStatus(`无法读取这个页面：${error.message}`);
  }
}

toggleEl.addEventListener("click", toggleDarkMode);
init();
