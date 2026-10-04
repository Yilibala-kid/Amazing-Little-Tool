const STYLE_ID = "__force_dark_current_page_style__";
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

async function runInCurrentTab(options = {}) {
  const [result] = await chrome.scripting.executeScript({
    target: {
      tabId: currentTabId,
      allFrames: true
    },
    func: controlPageDarkMode,
    args: [{ styleId: STYLE_ID, ...options }]
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

async function toggleDarkMode() {
  toggleEl.disabled = true;

  try {
    const enabled = await runInCurrentTab({ enabled: !isEnabled, css: DARK_CSS });

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
    const enabled = await runInCurrentTab();
    render(Boolean(enabled));
  } catch (error) {
    toggleEl.disabled = true;
    setStatus(`无法读取这个页面：${error.message}`);
  }
}

toggleEl.addEventListener("click", toggleDarkMode);
init();
