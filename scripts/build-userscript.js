// Bilibili Toolbox - Userscript Build Script
// Concatenates source files into BilibiliToolbox.user.js for Tampermonkey
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'BilibiliToolbox');
const OUT_FILE = path.join(SRC_DIR, 'BilibiliToolbox.user.js');

// Files to bundle, in load order
const JS_FILES = [
    'shared.js',
    'animations.js',
    'content.js'
];

// Tampermonkey header
const HEADER = `// ==UserScript==
// @name         Bilibili Toolbox
// @namespace    https://github.com/yilibala/amazing-little-tool
// @version      1.0.0
// @description  Bilibili comic reader + favorites toolbox in a single Tampermonkey file
// @author       Yilibala
// @match        *://www.bilibili.com/read/*
// @match        *://www.bilibili.com/opus/*
// @match        *://t.bilibili.com/*
// @match        *://www.bilibili.com/*
// @match        *://space.bilibili.com/*
// @run-at       document-start
// ==/UserScript==
`;

function build() {
    // Read CSS
    const cssPath = path.join(SRC_DIR, 'content.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const cssBase64 = Buffer.from(cssContent, 'utf8').toString('base64');

    // Read and concatenate JS files
    const jsContents = JS_FILES.map(file => {
        const filePath = path.join(SRC_DIR, file);
        if (!fs.existsSync(filePath)) {
            throw new Error('Source file not found: ' + filePath);
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return '\n// Bilibili Toolbox - ' + file + '\n' + content.trim() + '\n';
    });

    // Build CSS injection code
    const cssInjection =
        '\n// Bilibili Toolbox - CSS Injection\n' +
        '(function () {\n' +
        "    'use strict';\n" +
        '\n' +
        "    const styleBase64 = '" + cssBase64 + "';\n" +
        '    const decodeBase64Utf8 = (base64) => new TextDecoder().decode(Uint8Array.from(atob(base64), ch => ch.charCodeAt(0)));\n' +
        '    const styleText = decodeBase64Utf8(styleBase64);\n' +
        '    const injectStyle = () => {\n' +
        "        if (document.getElementById('bilibili-toolbox-userscript-style')) return;\n" +
        '        const parent = document.head || document.documentElement;\n' +
        '        if (!parent) {\n' +
        '            requestAnimationFrame(injectStyle);\n' +
        '            return;\n' +
        '        }\n' +
        '\n' +
        '        const style = document.createElement(\'style\');\n' +
        "        style.id = 'bilibili-toolbox-userscript-style';\n" +
        '        style.textContent = styleText;\n' +
        '        parent.appendChild(style);\n' +
        '    };\n' +
        '\n' +
        '    injectStyle();\n' +
        '});\n';

    // Build final output: header + CSS injection + JS files
    const output = HEADER + cssInjection + jsContents.join('') + '\n';

    // Write output
    fs.writeFileSync(OUT_FILE, output, 'utf8');
    console.log('Built: ' + OUT_FILE);
}

build();
