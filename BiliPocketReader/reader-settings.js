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
            animations.syncAnimationButton(this.el.animationBtn, this.animationMode);
        },

        syncDirectionButton() {
            const dir = this.isRightToLeft;
            this.el.directionBtn.innerText = dir ? '\u4ece\u53f3\u5f80\u5de6 \u2190' : '\u4ece\u5de6\u5f80\u53f3 \u2192';
            this.el.directionBtn.title = dir ? '\u5f53\u524d\uff1a\u4ece\u53f3\u5f80\u5de6' : '\u5f53\u524d\uff1a\u4ece\u5de6\u5f80\u53f3';
        },

        syncViewModeButton() {
            const map = {
                auto: ['\u81ea\u52a8', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u81ea\u52a8'],
                single: ['\u5355\u56fe', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u5355\u56fe'],
                double: ['\u53cc\u56fe', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u53cc\u56fe']
            };
            const [text, title] = map[this.viewMode] || map.auto;
            Object.assign(this.el.viewModeBtn, { innerText: text, title });
        },

        syncImageRenderButton() {
            const sharp = this.imageRenderMode === 'sharp';
            this.el.imageRenderBtn.innerText = sharp ? '\u539f\u56fe' : '\u6d41\u7545';
            this.el.imageRenderBtn.title = sharp
                ? '\u663e\u793a\u6a21\u5f0f\uff1a\u539f\u56fe\uff08\u4fdd\u7559\u81ea\u7136\u50cf\u7d20\uff0c\u53cc\u51fb 1:1 \u67e5\u770b\uff09'
                : '\u663e\u793a\u6a21\u5f0f\uff1a\u6d41\u7545\uff08\u6d4f\u89c8\u5668\u9002\u5c4f\u7f29\u653e\uff0c\u7ffb\u9875\u548c\u7f29\u653e\u66f4\u67d4\u548c\uff09';
            this.el.imageRenderBtn.classList.remove('active');
        },

        syncBackgroundButton() {
            const label = this.getReaderBackgroundLabel();
            this.el.backgroundBtn.innerText = label;
            this.el.backgroundBtn.title = `\u80cc\u666f\u989c\u8272\uff1a${label}`;
            this.el.backgroundBtn.classList.remove('active');
        },

        syncFilterControl() {
            if (!this.el.filterSelect) return;
            const mode = readerPreferences.normalizeFilterMode(this.filterMode);
            this.el.filterSelect.value = mode;
            this.el.filterSelect.title = `\u56fe\u50cf\u6ee4\u955c\uff1a${READER_FILTER_LABELS[mode]}`;
        },

        syncTapPageButton() {
            const enabled = Boolean(this.tapPageNavigation);
            this.el.tapPageBtn.innerText = enabled ? '\u70b9\u51fb\u7ffb\u9875' : '\u70b9\u51fb\u5173\u95ed';
            this.el.tapPageBtn.title = enabled
                ? '\u70b9\u51fb\u5c4f\u5e55\u5de6\u53f3\u533a\u57df\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09'
                : '\u70b9\u51fb\u5c4f\u5e55\u4e0d\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09';
            this.el.tapPageBtn.classList.toggle('active', enabled);
        },

        syncPreloadControl() {
            if (!this.el.preloadSelect) return;
            this.el.preloadSelect.value = this.preloadPages;
            this.el.preloadSelect.title = '打开页面时提前加载漫画图片；“全部”从第一页开始，按顺序逐张加载。';
        },

        syncImageMemoryControl() {
            if (!this.el.imageMemorySelect) return;
            this.el.imageMemorySelect.value = this.imageMemoryPolicy;
            this.el.imageMemorySelect.title = this.imageMemoryPolicy === 'previous'
                ? '翻页后释放当前图片之前的图片，返回时会重新加载。'
                : '关闭阅读器后仍保留已加载图片，离开漫画页面时清空。';
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

        getReaderBackgroundLabel() {
            return READER_BACKGROUND_LABELS[this.backgroundMode] || READER_BACKGROUND_LABELS.black;
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
