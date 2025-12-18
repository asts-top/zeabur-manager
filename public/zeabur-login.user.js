// ==UserScript==
// @name         Zeabur 快速登录
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  从 URL 参数自动登录 Zeabur 账号
// @author       Zeabur Monitor
// @match        https://dash.zeabur.com/*
// @match        https://zeabur.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    
    // 检查 URL 是否包含 token 参数
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('_token');
    
    if (token) {
        // 设置 cookie
        document.cookie = `token=${token}; path=/; domain=.zeabur.com; max-age=31536000; SameSite=Lax`;
        
        // 移除 URL 中的 token 参数，避免泄露
        urlParams.delete('_token');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        
        // 替换 URL 并刷新
        window.history.replaceState({}, '', newUrl);
        window.location.reload();
    }
})();
