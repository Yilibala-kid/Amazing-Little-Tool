param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutputPath) {
    $OutputPath = Join-Path $Root "dist\BiliPocketReader.user.js"
}

$ManifestPath = Join-Path $Root "manifest.json"
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$ContentScript = $Manifest.content_scripts[0]
$OutputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$OutputDir = Split-Path -Parent $OutputFullPath

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

function Join-UserScriptMatches {
    param([object[]]$Matches)

    return ($Matches | ForEach-Object { "// @match        $_" }) -join [Environment]::NewLine
}

function Convert-ToJavaScriptString {
    param([string]$Value)

    return $Value | ConvertTo-Json -Compress
}

$MatchLines = Join-UserScriptMatches -Matches $ContentScript.matches
$UserScriptName = ($Manifest.name -replace "[\r\n]+", " ").Trim()
$UserScriptDescription = ($Manifest.description -replace "[\r\n]+", " ").Trim()
if (-not $UserScriptDescription) {
    $UserScriptDescription = "Bilibili comic reader and favorites shortcut"
}
$UserScriptDescription = "Bilibili comic reader and favorites shortcut"
$CssText = ""
foreach ($CssFile in $ContentScript.css) {
    $CssPath = Join-Path $Root $CssFile
    $CssText += "/* ===== $CssFile ===== */`n"
    $CssText += Get-Content -LiteralPath $CssPath -Raw -Encoding UTF8
    $CssText += "`n"
}
$CssJson = Convert-ToJavaScriptString $CssText

$HeaderLines = @(
    "// ==UserScript==",
    "// @name         $UserScriptName",
    "// @namespace    https://local/bilibili-toolbox",
    "// @version      $($Manifest.version)",
    "// @description  $UserScriptDescription"
) + ($MatchLines -split "\r?\n") + @(
    "// @run-at       document-start",
    "// @grant        GM.getValue",
    "// @grant        GM.setValue",
    "// @grant        GM_getValue",
    "// @grant        GM_setValue",
    "// ==/UserScript=="
)
$Header = ($HeaderLines -join "`n") + "`n`n"

$Compat = @"
(function() {
    'use strict';

    const STORAGE_PREFIX = 'bilibili-toolbox-userscript:';
    const changeListeners = new Set();

    function hasLegacyGmStorage() {
        return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
    }

    function hasModernGmStorage() {
        return typeof GM === 'object'
            && typeof GM.getValue === 'function'
            && typeof GM.setValue === 'function';
    }

    function readLocalValue(key) {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (raw === null) return undefined;
        try { return JSON.parse(raw); } catch (_) { return undefined; }
    }

    function getFavoriteKey(item) {
        if (!item || typeof item !== 'object') return '';
        const type = item.type === 'readlist' ? 'readlist' : 'user';
        const value = type === 'readlist' ? item.id : item.uid;
        return value ? type + ':' + value : '';
    }

    function mergeStoredValue(primary, localValue) {
        if (!primary || !localValue || typeof primary !== 'object' || typeof localValue !== 'object') {
            return primary === undefined ? localValue : primary;
        }
        if (!Array.isArray(primary.favorites) || !Array.isArray(localValue.favorites)) return primary;

        const favorites = [...primary.favorites];
        const keys = new Set(favorites.map(getFavoriteKey).filter(Boolean));
        localValue.favorites.forEach(item => {
            const key = getFavoriteKey(item);
            if (!key || keys.has(key)) return;
            keys.add(key);
            favorites.push(item);
        });

        return {
            ...localValue,
            ...primary,
            settings: { ...(localValue.settings || {}), ...(primary.settings || {}) },
            favorites
        };
    }

    async function readValue(key) {
        if (hasModernGmStorage() || hasLegacyGmStorage()) {
            const localValue = readLocalValue(key);
            const gmValue = hasModernGmStorage() ? await GM.getValue(key) : GM_getValue(key);
            const merged = mergeStoredValue(gmValue, localValue);
            if (localValue !== undefined && JSON.stringify(merged) !== JSON.stringify(gmValue)) {
                await writeValue(key, merged);
            }
            return merged;
        }
        return readLocalValue(key);
    }

    async function writeValue(key, value) {
        if (hasModernGmStorage()) {
            await GM.setValue(key, value);
            return;
        }
        if (hasLegacyGmStorage()) {
            GM_setValue(key, value);
            return;
        }
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    }

    function normalizeGetKeys(keys) {
        if (Array.isArray(keys)) return keys.map(key => [key, undefined]);
        if (typeof keys === 'string') return [[keys, undefined]];
        if (keys && typeof keys === 'object') return Object.entries(keys);
        return [];
    }

    const chromeShim = window.chrome || {};
    chromeShim.storage = chromeShim.storage || {};
    chromeShim.storage.local = chromeShim.storage.local || {
        async get(keys) {
            const result = {};
            for (const [key, fallback] of normalizeGetKeys(keys)) {
                const value = await readValue(key);
                result[key] = value === undefined ? fallback : value;
            }
            return result;
        },
        async set(items) {
            const changes = {};
            for (const [key, newValue] of Object.entries(items || {})) {
                const oldValue = await readValue(key);
                await writeValue(key, newValue);
                changes[key] = { oldValue, newValue };
            }
            changeListeners.forEach(listener => listener(changes, 'local'));
        }
    };
    chromeShim.storage.onChanged = chromeShim.storage.onChanged || {
        addListener(listener) { changeListeners.add(listener); },
        removeListener(listener) { changeListeners.delete(listener); }
    };
    chromeShim.runtime = chromeShim.runtime || {};
    chromeShim.runtime.onMessage = chromeShim.runtime.onMessage || {
        addListener() {},
        removeListener() {}
    };
    window.chrome = chromeShim;

    const css = $CssJson;
    function injectStyle() {
        if (document.getElementById('bilibili-toolbox-userscript-style')) return;
        const style = document.createElement('style');
        style.id = 'bilibili-toolbox-userscript-style';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }
    if (document.documentElement) injectStyle();
    else document.addEventListener('DOMContentLoaded', injectStyle, { once: true });
})();

"@

$Sections = foreach ($JsFile in $ContentScript.js) {
    $JsPath = Join-Path $Root $JsFile
    "// ===== $JsFile =====`n" + (Get-Content -LiteralPath $JsPath -Raw -Encoding UTF8).TrimEnd([char[]]"`r`n")
}
$Body = ($Sections -join "`n`n") + "`n"

$Output = $Header + $Compat + $Body
[System.IO.File]::WriteAllText($OutputFullPath, $Output, [System.Text.UTF8Encoding]::new($false))

Write-Host "Built userscript:"
Write-Host $OutputFullPath
