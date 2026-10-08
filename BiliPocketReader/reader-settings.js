// Bilibili Toolbox - readerSettings
(function() {
    'use strict';

    const Toolbox = window.BilibiliToolbox;
    const readerPreferences = Toolbox.readerPreferences;
    const animations = Toolbox.animations;
    const READER_BACKGROUND_COLORS = Object.freeze({
        black: '#0a0a0a',
        darkGray: '#1f1f1f',
        lightGray: '#d8d8d8',
        white: '#ffffff'
    });
    const READER_BACKGROUND_LABELS = Object.freeze({
        black: '\u9ed1\u8272',
        darkGray: '\u6df1\u7070',
        lightGray: '\u6d45\u7070',
        white: '\u767d\u8272'
    });
    const READER_FILTER_CSS = Object.freeze({
        original: 'none',
        soft: 'brightness(.94) contrast(.92) saturate(.92)',
        warm: 'sepia(.18) saturate(.9) brightness(.96)',
        grayscale: 'grayscale(1)'
    });
    const READER_FILTER_LABELS = Object.freeze({
        original: '\u539f\u56fe',
        soft: '\u67d4\u548c',
        warm: '\u6696\u8272\u62a4\u773c',
        grayscale: '\u9ed1\u767d'
    });
    const READER_ANIMATION_LABELS = Object.freeze({ smooth: '平滑', fade: '淡入' });
    const PREFERENCE_EFFECTS = {
        isRightToLeft: ['updateDirection', 'syncDirectionButton'],
        animationMode: ['syncAnimationButton'],
        viewMode: ['syncViewModeButton'],
        imageRenderMode: ['syncImageRenderButton'],
        filterMode: ['syncFilterControl', 'applyReaderFilter'],
        preloadPages: ['syncPreloadControl', 'syncImageLoadingSettings'],
        imageMemoryPolicy: ['syncImageMemoryControl', 'syncImageLoadingSettings'],
        backgroundMode: ['syncBackgroundButton', 'applyReaderBackground'],
        tapPageNavigation: ['syncTapPageButton']
    };

    function preferenceValue(reader, key) {
        return readerPreferences.normalize({ [key]: reader[key] })[key];
    }

    function syncSettingButton(reader, button, key, text, title) {
        if (!button) return;
        const value = preferenceValue(reader, key);
        button.querySelector('.comic-setting-value').textContent = text;
        button.dataset.value = String(value);
        button.setAttribute('aria-label', `${button.dataset.settingLabel}：${text}`);
        if (typeof value === 'boolean') button.setAttribute('aria-pressed', String(value));
        button.title = `${title}\n点击切换设置。`;
    }

    const methods = {
        savePreferences() {
            void readerPreferences.save(this).catch(() => {});
        },

        setPreference(key, value) {
            if (!Object.hasOwn(PREFERENCE_EFFECTS, key)) throw new Error('Unknown reader preference: ' + key);
            this[key] = readerPreferences.normalize({ [key]: value })[key];
            PREFERENCE_EFFECTS[key].forEach(name => this[name]());
            this.savePreferences();
            if (key === 'viewMode') this.render(false);
            if (key === 'imageRenderMode') this.refreshImagesForRenderMode();
        },

        cyclePreference(key, modes) {
            const next = modes[(modes.indexOf(this[key]) + 1) % modes.length];
            this.setPreference(key, next);
        },

        syncAnimationButton() {
            const mode = animations.normalizeAnimationMode(this.animationMode);
            const descriptions = {
                smooth: '淡入、平移与细微缩放。',
                fade: '使用淡入淡出翻页。'
            };
            syncSettingButton(this, this.el.animationBtn, 'animationMode', READER_ANIMATION_LABELS[mode], descriptions[mode]);
        },

        syncDirectionButton() {
            const dir = preferenceValue(this, 'isRightToLeft');
            const text = dir ? '从右往左' : '从左往右';
            syncSettingButton(this, this.el.directionBtn, 'isRightToLeft', text, `阅读方向：${text}。`);
        },

        syncViewModeButton() {
            const map = {
                auto: ['自动', '根据图片宽高自动选择单图或双图，宽图单独显示。'],
                single: ['单图', '每次显示一张漫画图片。'],
                double: ['双图', '每次尽量同时显示两张漫画图片。']
            };
            const [text, title] = map[preferenceValue(this, 'viewMode')] || map.auto;
            syncSettingButton(this, this.el.viewModeBtn, 'viewMode', text, title);
        },

        syncImageRenderButton() {
            const sharp = preferenceValue(this, 'imageRenderMode') === 'sharp';
            const title = sharp
                ? '\u663e\u793a\u6a21\u5f0f\uff1a\u539f\u56fe\uff08\u4fdd\u7559\u81ea\u7136\u50cf\u7d20\uff0c\u53cc\u51fb 1:1 \u67e5\u770b\uff09'
                : '\u663e\u793a\u6a21\u5f0f\uff1a\u6d41\u7545\uff08\u6d4f\u89c8\u5668\u9002\u5c4f\u7f29\u653e\uff0c\u7ffb\u9875\u548c\u7f29\u653e\u66f4\u67d4\u548c\uff09';
            syncSettingButton(this, this.el.imageRenderBtn, 'imageRenderMode', sharp ? '原图' : '流畅', title);
        },

        syncBackgroundButton() {
            const mode = preferenceValue(this, 'backgroundMode');
            const label = READER_BACKGROUND_LABELS[mode];
            syncSettingButton(this, this.el.backgroundBtn, 'backgroundMode', label, `背景颜色：${label}。`);
        },

        syncFilterControl() {
            const mode = readerPreferences.normalizeFilterMode(this.filterMode);
            syncSettingButton(this, this.el.filterBtn, 'filterMode', READER_FILTER_LABELS[mode], '图像滤镜仅影响显示，不影响原图和截图。');
        },

        syncTapPageButton() {
            const enabled = preferenceValue(this, 'tapPageNavigation');
            const title = enabled
                ? '\u70b9\u51fb\u5c4f\u5e55\u5de6\u53f3\u533a\u57df\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09'
                : '\u70b9\u51fb\u5c4f\u5e55\u4e0d\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09';
            syncSettingButton(this, this.el.tapPageBtn, 'tapPageNavigation', enabled ? '开启' : '关闭', `仅移动端：${title}`);
        },

        syncPreloadControl() {
            const mode = preferenceValue(this, 'preloadPages');
            const text = mode === 'all' ? '全部' : `${mode}页`;
            const title = mode === 'all'
                ? '进入页面即从第一页开始，依次逐张预加载本篇漫画图片；已加载图片直接复用。'
                : `打开页面时提前加载前${mode}页，阅读时提前加载后续${mode}页；每张图片计为一页。`;
            syncSettingButton(this, this.el.preloadBtn, 'preloadPages', text, title);
        },

        syncImageMemoryControl() {
            const previous = preferenceValue(this, 'imageMemoryPolicy') === 'previous';
            const title = previous
                ? '翻页后释放当前图片之前的图片，返回时会重新加载。'
                : '关闭阅读器后仍保留已加载图片，离开漫画页面时清空。';
            syncSettingButton(this, this.el.imageMemoryBtn, 'imageMemoryPolicy', previous ? '释放前页' : '关闭页释放', title);
        },

        syncRotateButton() {
            const rot = this.rotation;
            this.el.rotateBtn.innerText = rot === 0 ? '\u65cb\u8f6c' : `${rot}\u5ea6`;
            this.el.rotateBtn.title = rot === 0 ? '\u65cb\u8f6c90\u5ea6' : `\u5f53\u524d\u65cb\u8f6c\uff1a${rot}\u5ea6`;
        },

        syncFullscreenButton() {
            if (this.el.fullScreenBtn) {
                this.el.fullScreenBtn.innerText = document.fullscreenElement ? '\u9000\u51fa\u5168\u5c4f' : '\u5168\u5c4f';
                this.el.fullScreenBtn.title = this.el.fullScreenBtn.innerText;
            }
        },

        isSettingsPanelVisible() {
            return Boolean(this.el.settingsPanel?.classList.contains('show'));
        },

        toggleSettingsPanel() {
            if (this.isSettingsPanelVisible()) {
                this.hideSettingsPanel();
                return;
            }
            this.showControls();
            this.el.settingsPanel.classList.add('show');
            this.el.settingsPanel.setAttribute('aria-hidden', 'false');
            this.el.settingsBtn.classList.add('active');
        },

        hideSettingsPanel() {
            if (!this.el.settingsPanel) return;
            this.el.settingsPanel.classList.remove('show');
            this.el.settingsPanel.setAttribute('aria-hidden', 'true');
            this.el.settingsBtn?.classList.remove('active');
        },

        handleSettingsOutsidePointerDown(e) {
            if (!this.isSettingsPanelVisible()) return;
            const target = e.target instanceof Element ? e.target : null;
            if (target && (this.el.settingsPanel.contains(target) || this.el.settingsBtn.contains(target))) return;
            this.hideSettingsPanel();
        },

        getReaderBackgroundColor() {
            return READER_BACKGROUND_COLORS[this.backgroundMode] || READER_BACKGROUND_COLORS.black;
        },

        applyReaderBackground() {
            if (this.el.reader) this.el.reader.style.background = this.getReaderBackgroundColor();
        },

        getReaderFilterCss() {
            const mode = readerPreferences.normalizeFilterMode(this.filterMode);
            return READER_FILTER_CSS[mode] || READER_FILTER_CSS.original;
        },

        applyReaderFilter() {
            if (this.el.reader) {
                this.el.reader.style.setProperty('--comic-image-filter', this.getReaderFilterCss());
            }
        }
    };

    function attach(reader) {
        return Toolbox.attachMethods(reader, methods);
    }

    Toolbox.readerSettings = { attach, methods };
})();
