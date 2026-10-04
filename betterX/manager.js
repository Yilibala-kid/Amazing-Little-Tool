(function() {
    'use strict';

    const BetterX = globalThis.BetterX ||= {};

    BetterX.createManager = function({ getSettings, saveSettings, timeline, downloads }) {
        let messageTimer = 0;

        function createManagerButton() {
            if (document.getElementById('betterx-manager-button')) return;
            const button = document.createElement('div');
            button.id = 'betterx-manager-button';
            button.title = 'betterX 视频推文过滤';
            button.innerHTML = 'X<span class="betterx-manager-badge">0</span>';
            document.body.appendChild(button);
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                togglePanel();
            });
        }

        function createManagerPanel() {
            if (document.getElementById('betterx-manager-panel')) return;
            const panel = document.createElement('div');
            panel.id = 'betterx-manager-panel';
            panel.innerHTML = `
                <div class="betterx-panel-header">
                    <span>betterX 视频过滤</span>
                </div>
                <div class="betterx-panel-content">
                    <div class="betterx-status-row">
                        <div class="betterx-stat">
                            <span class="betterx-stat-value" data-betterx-stat="video">0</span>
                            <span class="betterx-stat-label">已识别视频推文</span>
                        </div>
                        <div class="betterx-stat">
                            <span class="betterx-stat-value" data-betterx-stat="hidden">0</span>
                            <span class="betterx-stat-label">当前隐藏</span>
                        </div>
                    </div>
                    <section class="betterx-download-section" hidden>
                        <div class="betterx-download-copy">
                            <span class="betterx-control-title">下载本帖媒体</span>
                            <span class="betterx-control-desc" data-betterx-download-summary>正在识别图片、GIF 或视频</span>
                        </div>
                        <button class="betterx-action-button betterx-download-action" data-betterx-action="download">重新识别媒体</button>
                    </section>
                    <label class="betterx-control-row">
                        <span class="betterx-control-copy">
                            <span class="betterx-control-title">隐藏视频推文</span>
                            <span class="betterx-control-desc">隐藏时间线中含有视频播放器的推文</span>
                        </span>
                        <span class="betterx-switch">
                            <input type="checkbox" data-betterx-setting="hideVideos">
                            <span class="betterx-switch-slider"></span>
                        </span>
                    </label>
                    <label class="betterx-control-row">
                        <span class="betterx-control-copy">
                            <span class="betterx-control-title">暂时显示已隐藏</span>
                            <span class="betterx-control-desc">保留识别结果，但临时放出视频推文</span>
                        </span>
                        <span class="betterx-switch">
                            <input type="checkbox" data-betterx-setting="revealHidden">
                            <span class="betterx-switch-slider"></span>
                        </span>
                    </label>
                    <div class="betterx-panel-actions">
                        <button class="betterx-action-button" data-betterx-action="scan">重新扫描</button>
                        <button class="betterx-action-button secondary" data-betterx-action="close">关闭</button>
                    </div>
                    <div class="betterx-message">默认自动处理新加载的推文</div>
                </div>
            `;
            document.body.appendChild(panel);
            panel.querySelectorAll('[data-betterx-setting]').forEach(input => {
                input.addEventListener('change', () => {
                    saveSettings({ ...getSettings(), [input.dataset.betterxSetting]: input.checked });
                });
            });
            panel.querySelector('[data-betterx-action="scan"]').addEventListener('click', () => {
                const result = timeline.scan();
                showMessage(`已扫描 ${result.scanned} 条推文，识别 ${timeline.getCounts().videoTweetCount} 条视频推文`);
            });
            panel.querySelector('[data-betterx-action="download"]').addEventListener('click', downloads.download);
            panel.querySelector('[data-betterx-action="close"]').addEventListener('click', hidePanel);
        }

        function renderManagerState() {
            const button = document.getElementById('betterx-manager-button');
            const panel = document.getElementById('betterx-manager-panel');
            const settings = getSettings();
            const { hiddenCount, videoTweetCount } = timeline.getCounts();
            button?.classList.toggle('betterx-paused', !timeline.isFilterActive());
            const badge = button?.querySelector('.betterx-manager-badge');
            if (badge) {
                badge.textContent = String(hiddenCount);
                badge.style.display = hiddenCount > 0 ? 'block' : 'none';
            }
            if (!panel) return;
            panel.querySelector('[data-betterx-stat="video"]').textContent = String(videoTweetCount);
            panel.querySelector('[data-betterx-stat="hidden"]').textContent = String(hiddenCount);
            panel.querySelector('[data-betterx-setting="hideVideos"]').checked = settings.hideVideos;
            panel.querySelector('[data-betterx-setting="revealHidden"]').checked = settings.revealHidden;
        }

        function showMessage(text) {
            const message = document.querySelector('.betterx-message');
            if (!message) return;
            if (messageTimer) clearTimeout(messageTimer);
            message.textContent = text;
            messageTimer = window.setTimeout(() => {
                message.textContent = '默认自动处理新加载的推文';
                messageTimer = 0;
            }, 2400);
        }

        function togglePanel() {
            createManagerPanel();
            const panel = document.getElementById('betterx-manager-panel');
            panel?.classList.toggle('show');
            renderManagerState();
            downloads.render();
        }

        function hidePanel() {
            document.getElementById('betterx-manager-panel')?.classList.remove('show');
        }

        function handleDocumentPointerDown(event) {
            const panel = document.getElementById('betterx-manager-panel');
            const button = document.getElementById('betterx-manager-button');
            if (!panel?.classList.contains('show')) return;
            if (panel.contains(event.target) || button?.contains(event.target)) return;
            hidePanel();
        }

        function handleDocumentKeyDown(event) {
            if (event.key === 'Escape') hidePanel();
        }

        return {
            render: renderManagerState, showMessage,
            start() {
                createManagerButton();
                createManagerPanel();
                document.addEventListener('pointerdown', handleDocumentPointerDown, true);
                document.addEventListener('keydown', handleDocumentKeyDown);
            },
            destroy() {
                clearTimeout(messageTimer);
                document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
                document.removeEventListener('keydown', handleDocumentKeyDown);
                document.getElementById('betterx-manager-panel')?.remove();
                document.getElementById('betterx-manager-button')?.remove();
            }
        };
    };
})();
