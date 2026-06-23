// Bilibili Toolbox - favorites import/export text dialog
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    let activeClose = null;

    function closeFavoritesTextDialog() {
        if (activeClose) {
            activeClose();
            return;
        }
        document.querySelector('#bilibili-toolbox-export-dialog .bilibili-toolbox-export-close')?.click();
    }

    function showFavoritesTextDialog({ title, text = '', readOnly = false, clipboardAction = '', confirmText = '', onConfirm = null }) {
        closeFavoritesTextDialog();
        const dialog = document.createElement('div');
        dialog.id = 'bilibili-toolbox-export-dialog';
        dialog.className = 'bilibili-toolbox-export-dialog';
        dialog.innerHTML = `
            <div class="bilibili-toolbox-export-document" role="dialog" aria-modal="true" aria-labelledby="bilibili-toolbox-export-title">
                <div class="bilibili-toolbox-export-header">
                    <span id="bilibili-toolbox-export-title"></span>
                    <button class="bilibili-toolbox-export-close" type="button" aria-label="\u5173\u95ed">&times;</button>
                </div>
                <textarea class="bilibili-toolbox-export-text" aria-label="\u6536\u85cf\u6587\u672c" spellcheck="false"></textarea>
                ${clipboardAction || onConfirm ? `
                    <div class="bilibili-toolbox-export-footer">
                        <span class="bilibili-toolbox-export-status" role="status"></span>
                        <div class="bilibili-toolbox-export-actions">
                            ${clipboardAction ? '<button class="bilibili-toolbox-export-clipboard" type="button"></button>' : ''}
                            ${onConfirm ? '<button class="bilibili-toolbox-export-confirm" type="button"></button>' : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        const handleKeyDown = event => {
            if (event.key === 'Escape') closeDialog();
        };
        const closeDialog = () => {
            document.removeEventListener('keydown', handleKeyDown);
            dialog.remove();
            if (activeClose === closeDialog) activeClose = null;
        };
        activeClose = closeDialog;

        dialog.querySelector('.bilibili-toolbox-export-close').addEventListener('click', closeDialog);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) closeDialog();
        });
        document.addEventListener('keydown', handleKeyDown);
        document.body.appendChild(dialog);

        dialog.querySelector('#bilibili-toolbox-export-title').textContent = title;
        const textarea = dialog.querySelector('.bilibili-toolbox-export-text');
        textarea.value = text;
        textarea.readOnly = readOnly;
        const status = dialog.querySelector('.bilibili-toolbox-export-status');
        const setStatus = (message, isError = false) => {
            if (!status) return;
            status.textContent = message;
            status.classList.toggle('is-error', isError);
        };

        if (clipboardAction) {
            const clipboard = dialog.querySelector('.bilibili-toolbox-export-clipboard');
            clipboard.textContent = clipboardAction === 'copy' ? '\u4e00\u952e\u590d\u5236' : '\u4e00\u952e\u7c98\u8d34';
            clipboard.addEventListener('click', async () => {
                try {
                    if (clipboardAction === 'copy') {
                        await navigator.clipboard.writeText(textarea.value);
                        setStatus('\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
                    } else {
                        textarea.value = await navigator.clipboard.readText();
                        textarea.focus();
                        setStatus('\u5df2\u7c98\u8d34\u526a\u8d34\u677f\u5185\u5bb9');
                    }
                } catch (_) {
                    textarea.focus();
                    if (clipboardAction === 'copy') textarea.select();
                    setStatus(
                        clipboardAction === 'copy'
                            ? '\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\uff0c\u8bf7\u6309 Ctrl+C \u624b\u52a8\u590d\u5236'
                            : '\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\uff0c\u8bf7\u6309 Ctrl+V \u624b\u52a8\u7c98\u8d34',
                        true
                    );
                }
            });
        }

        if (onConfirm) {
            const confirm = dialog.querySelector('.bilibili-toolbox-export-confirm');
            confirm.textContent = confirmText;
            confirm.addEventListener('click', () => onConfirm({ text: textarea.value, close: closeDialog, setStatus }));
        }

        textarea.focus();
        if (readOnly) textarea.select();
        return dialog;
    }

    Toolbox.favoritesTextDialog = {
        show: showFavoritesTextDialog,
        close: closeFavoritesTextDialog
    };
})();
