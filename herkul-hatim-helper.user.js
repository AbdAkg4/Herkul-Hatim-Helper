// ==UserScript==
// @name         Herkul — Hatim Heper
// @namespace    local.herkul.already-read
// @homepageURL  https://github.com/AbdAkg4/Herkul-Hatim-Helper
// @supportURL   https://github.com/AbdAkg4/Herkul-Hatim-Helper/issues
// @updateURL    https://raw.githubusercontent.com/AbdAkg4/Herkul-Hatim-Helper/main/herkul-hatim-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/AbdAkg4/Herkul-Hatim-Helper/main/herkul-hatim-helper.user.js
// @version      1.5.0
// @description  Sequentially test or claim Quran pages you have already read. Simulation is always the default.
// @match        https://herkul.app/*
// @match        https://herkul.org/*
// @match        https://www.herkul.org/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';
    if (window.top !== window.self || document.getElementById('herkul-claimer')) return;

    // Installed on all routes so Next.js client-side navigation keeps the panel alive.
    // No API guessing, hidden next-page buttons, parallel claims, or full reloads.
    const QUEUE = '/ortak-kuran';
    const KEY = 'herkul-already-read-v1';
    const JOURNAL = KEY + '-unresolved';
    const LOCK = KEY + '-run';
    const RUN_KEY = KEY + '-tab-run';
    const normalize = s => String(s ?? '').toLocaleLowerCase('tr-TR').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
    const isMark = b => normalize(b.textContent).includes('okundu olarak isaretle');
    const main = () => document.querySelector('main');
    const buttons = () => [...(main()?.querySelectorAll('button') || [])];
    const enabled = b => b && b.isConnected && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
    const readerNumber = () => {
        const m = location.pathname.match(/^\/kuran-i-kerim\/page\/(\d+)\/?$/);
        return m && new URLSearchParams(location.search).get('ortakHatim') === 'true' ? +m[1] : null;
    };
    const relevant = () => location.pathname.replace(/\/$/, '') === QUEUE || readerNumber() !== null;

    // Exact mapping supplied by the user: first Cüz includes Fâtiha (0), last ends at 604.
    const CUZ_RANGES = Array.from({length:30}, (_, i) => ({
        number:i + 1, first:i === 0 ? 0 : i * 20 + 1, last:i === 29 ? 604 : (i + 1) * 20
    }));
    const rangeText = range => `${range.first}-${range.last}`;

    function parsePages(input) {
        const result = new Set();
        const parts = input.trim().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').split(/[,;\s]+/).filter(Boolean);
        if (!parts.length) throw Error('Enter page numbers or ranges first.');
        for (const token of parts) {
            const m = /^(\d+)(?:-(\d+))?$/.exec(token);
            if (!m) throw Error(`Invalid entry: ${token}`);
            const a = +m[1], b = +(m[2] ?? m[1]);
            if (a < 0 || b > 604 || a > b) throw Error(`Invalid range: ${token}. Use pages 1–604; 0 means Fâtiha.`);
            for (let n = a; n <= b; n++) result.add(n);
        }
        return [...result]; // Deduplicate, preserving the entered order.
    }

    let queueDetail = 'waiting for site data';
    function snapshot() {
        if (location.pathname.replace(/\/$/, '') !== QUEUE) return null;
        const states = new Map();
        let round = null;
        for (const section of main()?.querySelectorAll('section') || []) {
            const heading = normalize(section.querySelector('h2')?.textContent);
            const state = heading === 'siradakiler' ? 'available' : heading === 'su anda okunuyor' ? 'reserved' : heading === 'tamamlananlar' ? 'completed' : null;
            if (!state) continue;
            for (const button of section.querySelectorAll('button')) {
                const text = normalize(button.textContent);
                const m = /^(\d+)\.\s*sayfa/.exec(text);
                const page = m ? +m[1] : /^fatiha suresi/.test(text) ? 0 : null;
                const r = /([\d.]+)\.\s*hatim/.exec(text)?.[1]?.replace(/\./g, '');
                if (r) {
                    if (round && round !== r) { queueDetail = 'updating hatim round'; return null; }
                    round = r;
                }
                if (page !== null) {
                    if (states.has(page)) throw Error(`Duplicate queue entry for page ${page}.`);
                    states.set(page, {state, button});
                }
            }
        }
        // The site has 605 entries: Fâtiha (0) and numbered pages 1–604.
        // Never infer availability from a partial/loading queue.
        if (states.size !== 605 || !round) { queueDetail = `loading pages (${states.size}/605)`; return null; }
        queueDetail = 'queue ready';
        return {states, round};
    }

    const host = document.createElement('div');
    host.id = 'herkul-claimer';
    Object.assign(host.style, {position:'fixed', right:'12px', bottom:'12px', width:'330px', maxWidth:'calc(100vw - 16px)', zIndex:'2147483647'});
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>
      :host{font:12px/1.4 system-ui,-apple-system,sans-serif;color:#e6f1f5;color-scheme:dark}
      *{box-sizing:border-box}
      .panel{background:linear-gradient(145deg,#1c303b,#101e28 60%,#132631);border:1px solid #4b6978;border-radius:12px;box-shadow:0 22px 60px #0008,0 4px 10px #0005,inset 0 1px 0 #ffffff20;overflow:hidden}
      header{padding:8px 10px;background:linear-gradient(180deg,#2c4858,#203744);border-bottom:1px solid #0a1720;box-shadow:inset 0 1px 0 #ffffff1c,0 1px 0 #ffffff08;cursor:move;touch-action:none;font-weight:750;user-select:none;display:flex;justify-content:space-between;align-items:center;letter-spacing:.15px}
      .body{padding:10px;display:grid;gap:8px;max-height:calc(100dvh - 75px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#4c6b79 #13232d}
      label{display:grid;gap:4px;font-weight:600}.field-title{font-weight:650}.cuz-heading{display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:5px}.mode-row{grid-template-columns:38px minmax(0,1fr);align-items:center}
      textarea,select,button{font:inherit;color:inherit;border-radius:6px}
      textarea,select{width:100%;padding:6px 8px;border:1px solid #4b6574;background:linear-gradient(180deg,#12232e,#1b303c);box-shadow:inset 0 2px 5px #0006,0 1px 0 #ffffff0d;transition:border-color .15s,box-shadow .15s}
      textarea{resize:vertical;height:42px;min-height:36px;font-weight:450;line-height:1.4}
      select{cursor:pointer;font-weight:450}option{background:#1a303c;color:#e6f1f5}
      button{border:1px solid #66808f;border-bottom-color:#253f4d;background:linear-gradient(180deg,#3c5667,#2b4353 55%,#253c4b);box-shadow:0 3px 0 #081722,0 5px 8px #0003,inset 0 1px 0 #ffffff29;cursor:pointer;padding:6px 8px;font-weight:650;text-shadow:0 1px 1px #0006;transition:transform .12s,box-shadow .12s,filter .12s}
      button:hover:not(:disabled){filter:brightness(1.16);transform:translateY(-1px);box-shadow:0 4px 0 #081722,0 7px 12px #0004,inset 0 1px 0 #ffffff35}
      button:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #081722,inset 0 2px 4px #0004}
      button:disabled{opacity:.4;cursor:default;box-shadow:0 1px 0 #07151e,inset 0 1px 0 #ffffff10}
      button:focus-visible,summary:focus-visible{outline:2px solid #8debd4;outline-offset:3px}
      textarea:focus,select:focus{outline:none;border-color:#72d7c0;box-shadow:inset 0 2px 5px #0006,0 0 0 3px #54c8ad24}
      .cuz-grid{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:6px 4px;padding-bottom:2px}
      .cuz-button{min-width:0;height:25px;padding:0;font-size:11px;font-variant-numeric:tabular-nums;border-radius:5px}
      .cuz-button[aria-pressed="true"]{color:#edfff9;border-color:#8ff0d5;background:linear-gradient(180deg,#338a79,#236d5e);box-shadow:0 1px 0 #071d18,inset 0 2px 5px #032b2866,0 0 0 1px #67e2bd35;transform:translateY(2px)}
      .cuz-button[aria-pressed="true"]:hover:not(:disabled){transform:translateY(2px)}
      #cuzSelection{color:#92e0ca;font-size:10px;font-weight:450;text-align:right}
      .controls{display:grid;grid-template-columns:1.15fr 1fr 1fr 1fr;gap:6px;padding-bottom:3px}
      .controls button{padding:6px 4px;font-size:11px;white-space:nowrap}
      .primary{border-color:#6bd6bb;border-bottom-color:#164e41;background:linear-gradient(180deg,#398f7b,#256f5e 60%,#1f6253)}
      .danger{border-color:#a66b72;border-bottom-color:#552d36;background:linear-gradient(180deg,#6b424f,#4d313e)}
      .note{color:#a9bdc9;font-size:10px}
      progress{appearance:none;width:100%;height:6px;border:1px solid #0b1921;border-radius:8px;background:#091923;box-shadow:inset 0 2px 4px #0007,0 1px 0 #ffffff12;overflow:hidden;accent-color:#59d2a9}
      progress::-webkit-progress-bar{background:#091923}progress::-webkit-progress-value{border-radius:6px;background:linear-gradient(180deg,#8ae5cc,#38ad8c)}progress::-moz-progress-bar{background:linear-gradient(180deg,#8ae5cc,#38ad8c)}
      #status{font-weight:650;overflow-wrap:anywhere}
      details{border:1px solid #365261;border-radius:9px;background:linear-gradient(180deg,#203542,#192c37);box-shadow:0 2px 0 #091923,inset 0 1px 0 #ffffff12}
      summary{cursor:pointer;padding:5px 8px;color:#c6dce6;font-size:11px;font-weight:600}
      #log{max-height:110px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.45 ui-monospace,monospace;background:#0b1a24;padding:10px;border-top:1px solid #365261;box-shadow:inset 0 2px 5px #0004}
      .log-line{padding:3px 5px;border-left:2px solid transparent;white-space:pre-wrap}
      .log-line + .log-line{margin-top:2px}
      .log-info{color:#9bbcd4;border-left-color:#47667d}
      .log-success{color:#8ce6b1;border-left-color:#46bd79;background:#214b3526}
      .log-warning{color:#f3ce82;border-left-color:#c89b44;background:#61491320}
      .log-error{color:#ffaaaa;border-left-color:#e47373;background:#763b3b28;font-weight:600}
      .tiny{width:23px;height:21px;padding:0;border-radius:7px}
      [hidden]{display:none!important}
      @media(prefers-reduced-motion:reduce){button,textarea,select{transition:none}}
    </style><div class="panel"><header><span>Hatim Helper · v1.5.0</span><button class="tiny" id="fold" title="Collapse">−</button></header><div class="body" id="body">
      <div><div class="cuz-heading"><span class="field-title" id="cuzTitle">Cüz / Juz</span><span id="cuzSelection">Custom pages</span></div><div class="cuz-grid" role="group" aria-labelledby="cuzTitle">${CUZ_RANGES.map(r => `<button type="button" class="cuz-button" id="cuz-${r.number}" aria-pressed="false" aria-label="Cüz ${r.number}, pages ${r.first}–${r.last}" title="Cüz ${r.number} · pages ${r.first}–${r.last}">${r.number}</button>`).join('')}</div></div>
      <label>Pages already read<textarea id="pages" placeholder="e.g. 301-310, 325" title="Pages 1–604; 0 = Fâtiha. Selecting a Cüz replaces this field." spellcheck="false"></textarea></label>
      <label class="mode-row">Mode<select id="mode"><option value="simulation">Simulation · no marking</option><option value="real">Real · mark as read</option></select></label>
      <div id="modeNote" class="note">Test only · no pages marked.</div>
      <div class="controls"><button id="check" title="Check availability of selected pages">Check</button><button id="start" class="primary">Start</button><button id="pause" disabled>Pause</button><button id="stop" class="danger" disabled>Stop</button></div>
      <div id="status" role="status" aria-live="polite">Ready · v1.5.0 · Simulation Mode</div><progress id="progress" value="0" max="1"></progress><div id="counts" class="note"></div>
      <details><summary>Activity log</summary><div id="log" role="log" aria-label="Activity log"></div></details>
    </div></div>`;
    document.documentElement.append(host);
    const $ = id => root.getElementById(id);
    let checking = false;
    let running = false, paused = false, stopped = false, mode = 'simulation', current = null;
    let done = 0, skipped = 0, simulated = 0, unverified = 0, total = 0, runRound = null;
    let runPages = [], runIndex = 0, ownsLock = false, leaving = false;
    const logEntries = [];
    const log = (message, level = 'info', time = new Date().toLocaleTimeString()) => {
        logEntries.push({message, level, time});
        if (logEntries.length > 100) logEntries.shift();
        const box = $('log');
        const severity = ['info', 'success', 'warning', 'error'].includes(level) ? level : 'info';
        const icons = {info:'·', success:'✓', warning:'!', error:'×'};
        const row = document.createElement('div');
        row.className = 'log-line log-' + severity;
        row.textContent = `${time} ${icons[severity]} ${message}`;
        box.append(row);
        while (box.childElementCount > 650) box.firstElementChild.remove();
        box.scrollTop = box.scrollHeight;
    };
    const status = s => { $('status').textContent = s; };
    function render() {
        for (const id of ['pages','mode','check','start']) $(id).disabled = running || checking;
        for (const r of CUZ_RANGES) $('cuz-' + r.number).disabled = running || checking;
        $('check').textContent = checking ? 'Checking…' : 'Check';
        $('pause').disabled = !running || stopped;
        $('stop').disabled = !running || stopped;
        $('pause').textContent = paused ? 'Resume' : 'Pause';
        $('progress').max = total || 1;
        $('progress').value = done + skipped + simulated + unverified;
        $('counts').textContent = `${done + skipped + simulated + unverified}/${total} processed · ${done} marked · ${simulated} simulated · ${skipped} skipped${unverified ? ` · ${unverified} submitted, unverified after rollover` : ''}`;
    }
    function saveRun() {
        if (!running || !ownsLock) return;
        sessionStorage.setItem(RUN_KEY, JSON.stringify({
            schema:1, savedAt:Date.now(), pages:runPages, index:runIndex, input:$('pages').value,
            mode, paused, stopped, done, skipped, simulated, unverified, round:runRound,
            pending:current === null ? null : readJournal(), logs:logEntries
        }));
    }
    function readSavedRun() {
        const raw = sessionStorage.getItem(RUN_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (s.schema !== 1 || !['simulation','real'].includes(s.mode) ||
            !Array.isArray(s.pages) || !s.pages.length ||
            s.pages.some(n => !Number.isInteger(n) || n < 0 || n > 604) ||
            new Set(s.pages).size !== s.pages.length ||
            !Number.isInteger(s.index) || s.index < 0 || s.index > s.pages.length ||
            !/^\d+$/.test(s.round) ||
            ['done','skipped','simulated','unverified'].some(k => !Number.isInteger(s[k]) || s[k] < 0) ||
            s.done + s.skipped + s.simulated + s.unverified !== s.index ||
            (s.pending && (s.pending.page !== s.pages[s.index] || s.pending.round !== s.round ||
                !['opening','opened','releasing','mark-sent'].includes(s.pending.phase)))) {
            throw Error('Saved run is invalid. Stop and start a fresh run from the queue.');
        }
        if (Date.now() - s.savedAt > 30 * 60 * 1000) {
            sessionStorage.removeItem(RUN_KEY);
            throw Error('Saved run expired. Return to the queue and start again.');
        }
        return s;
    }
    function readJournal() {
        const text = localStorage.getItem(JOURNAL);
        if (!text) return null;
        const j = JSON.parse(text);
        if (!Number.isInteger(j.page) || typeof j.round !== 'string') throw Error('Invalid recovery record. Resolve the outstanding page before continuing.');
        return j;
    }
    function journal(phase) {
        localStorage.setItem(JOURNAL, JSON.stringify({page:current, round:runRound, phase, at:Date.now()}));
        saveRun();
    }
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    // Only condition polling; there is no reading delay and no fixed delay between pages.
    async function waitFor(fn, label, timeout = 20000, onWaiting = null) {
        const started = Date.now();
        const until = started + timeout;
        do {
            if (leaving) throw Error('Document navigation in progress.');
            if (running && stopped && current === null) throw Error('Stopped before claiming a page.');
            if (!relevant()) throw Error('Navigation left the supported queue/reader. Run stopped.');
            const result = fn();
            if (result) return result;
            onWaiting?.(Date.now() - started);
            await sleep(100);
        } while (Date.now() < until);
        throw Error(`Timed out: ${label}. No automatic retry was made.`);
    }
    const newerRound = (a, b) => BigInt(a) > BigInt(b);
    const queueReady = async (minimumRound = null) => {
        const started = Date.now();
        let waitingLogged = false, lastSecond = -1;
        const s = await waitFor(() => {
            const next = snapshot();
            if (next && minimumRound && BigInt(next.round) < BigInt(minimumRound)) {
                queueDetail = 'refreshing hatim round';
                return null;
            }
            return next;
        }, 'Herkul has not finished loading its page list. Check your connection and try again', 60000, elapsed => {
            const second = Math.floor(elapsed / 1000);
            if (second !== lastSecond) {
                status(`Waiting for Herkul · ${second}s · ${queueDetail}`);
                lastSecond = second;
            }
            if (!waitingLogged && elapsed >= 1000) {
                log('Waiting for the website to load its page list…');
                waitingLogged = true;
            }
        });
        if (waitingLogged) log(`Website queue ready after ${((Date.now() - started) / 1000).toFixed(1)}s.`);
        return s;
    };
    function clearCurrent() {
        localStorage.removeItem(JOURNAL);
        current = null;
    }
    function adoptRound(s) {
        if (runRound && newerRound(s.round, runRound)) {
            log(`Hatim ${runRound} → ${s.round}: continuing with remaining selections; processed pages will not repeat.`, 'warning');
        }
        runRound = s.round;
    }
    function readerReady(n) {
        if (readerNumber() !== n) return false;
        const m = main();
        const text = normalize(m?.textContent);
        const correct = n === 0 ? text?.includes('fatiha') : new RegExp(`ortak hatim.*?\\b${n}\\.\\s*sayfa`).test(text);
        const paper = m?.querySelector('.reader-paper');
        return correct && paper && /[\u0600-\u06ff]/.test(paper.textContent) && buttons().some(b => isMark(b) && enabled(b));
    }
    async function goBack() {
        const b = buttons().find(b => normalize(b.getAttribute('aria-label')) === 'geri');
        if (!enabled(b)) throw Error('Reader Back button is unavailable. Return to the queue manually, then Check availability.');
        b.click();
        return queueReady(readJournal()?.round || runRound);
    }
    async function release() {
        if (current === null) return;
        const record = readJournal();
        const claimRound = record?.round || runRound;
        status(`Releasing page ${current}…`);
        const settled = s => {
            if (!s || BigInt(s.round) < BigInt(claimRound)) return false;
            const state = s.states.get(current)?.state;
            // A newer round retires every reservation from the old round.
            return newerRound(s.round, claimRound) || state === 'available' || state === 'completed';
        };
        // If opening is still in flight, wait for its result before attempting cleanup.
        if (readerNumber() !== current && location.pathname.replace(/\/$/,'') === QUEUE) {
            const s = await queueReady(claimRound);
            // 'opened'/'releasing' proves the reader already loaded. An available
            // queue entry here is a completed release, not an uncertain open.
            if (record?.phase !== 'opening' && settled(s)) {
                log(`Page ${current}: reservation settled (${s.round !== claimRound ? 'previous round retired' : s.states.get(current).state}).`);
                clearCurrent();
                return;
            }
            if (!s || s.states.get(current)?.state !== 'available') {
                await waitFor(() => readerNumber() === current, 'waiting for pending reader navigation');
            } else {
                // A failed open may still have a delayed claim; do not declare it released.
                throw Error('Open outcome is uncertain. Recovery record retained; no more pages will be opened.');
            }
        }
        if (readerNumber() !== current) throw Error('Unexpected reader page. Outstanding reservation retained for recovery.');
        journal('releasing');
        await goBack();
        await waitFor(() => {
            const s = snapshot();
            return settled(s);
        }, `confirming release of page ${current}`, 30000);
        log(`Page ${current}: reservation settled; continuing.`);
        clearCurrent();
    }
    async function recover(s) {
        const j = readJournal();
        if (!j) return;
        // A different round guarantees old-round reservations cannot be reused.
        if (newerRound(s.round, j.round) || s.round === j.round && ['available','completed'].includes(s.states.get(j.page)?.state)) {
            clearCurrent();
            log(`Recovery: page ${j.page} is ${s.round !== j.round ? 'in a finished round' : s.states.get(j.page).state}. Previous run will not resume automatically.`);
        } else throw Error(`Page ${j.page} still has an unresolved reservation. Wait for release, then Check availability. No new page will be opened.`);
    }
    async function check() {
        if (checking || running) return;
        checking = true; render();
        status('Checking availability…');
        try {
            const pages = parsePages($('pages').value);
            if (readerNumber() !== null) throw Error('Return to the queue with Geri before checking or starting.');
            const s = await queueReady(readJournal()?.round);
            await recover(s);
            const counts = {available:0, reserved:0, completed:0};
            for (const n of pages) { const state = s.states.get(n)?.state; counts[state]++; log(`Page ${n}: ${state}.`, state === 'completed' ? 'success' : state === 'reserved' ? 'warning' : 'info'); }
            status(`${counts.available} available · ${counts.reserved} reserved · ${counts.completed} completed`);
            log(`Hatim ${s.round}. Status reflects the live queue; availability is checked again at each claim.`);
            localStorage.setItem(KEY, $('pages').value);
        } catch(e) { status(e.message); log(e.message, 'error'); }
        finally { checking = false; render(); }
    }
    async function checkpoint() {
        while (paused && !stopped) { status('Paused · no page held'); await sleep(100); }
        return !stopped;
    }
    async function processPage(n) {
        const pending = current === n ? readJournal() : null;
        if (pending?.phase === 'mark-sent') {
            if (mode !== 'real') throw Error('Simulation cannot resume a completion submission.');
            return verifyCompletion(n);
        }
        if (pending?.phase === 'releasing') {
            await release();
            if (mode === 'simulation') simulated++;
            return mode === 'simulation' ? true : false;
        }
        if (!pending) {
        let s = await queueReady(runRound);
        adoptRound(s);
        // Re-read immediately before the claim; the site's claim operation arbitrates races.
        const entry = s.states.get(n);
        if (entry?.state !== 'available' || !enabled(entry.button)) {
            skipped++; log(`Page ${n}: skipped (${entry?.state || 'unavailable'}).`, 'warning'); return;
        }
        if (stopped || paused) return false;
        current = n;
        journal('opening'); // Written BEFORE the side effect; survives refresh/closed tab.
        status(`${mode === 'real' ? 'Claiming' : 'Simulating'} page ${n}…`);
        entry.button.click();
        }
        await waitFor(() => readerReady(n), `loading and verifying page ${n}`);
        journal('opened');
        log(`Page ${n}: reader URL, shared-hatim label, Arabic content and mark control verified.`);
        if (mode === 'simulation') {
            const candidate = buttons().find(b => isMark(b) && enabled(b));
            candidate.style.outline = '3px solid #59d2a9';
            candidate.title = 'SIMULATION: enabled and would be clicked in Real Mode; no click sent.';
            log(`Page ${n}: WOULD CLICK “Okundu olarak işaretle” — enabled. Simulation sent NO completion click.`, 'success');
        }
        if (mode === 'simulation' || stopped || paused) {
            await release();
            if (mode === 'simulation') simulated++;
            return mode === 'simulation' ? true : false;
        }
        // Sole completion click in the entire script. Mode is frozen for the run.
        if (mode !== 'real' || stopped || paused || !readerReady(n)) throw Error('Completion precondition failed.');
        const mark = buttons().find(b => isMark(b) && enabled(b));
        journal('mark-sent');
        mark.click();
        return verifyCompletion(n);
    }
    async function verifyCompletion(n) {
        // Never double-click or retry an uncertain completion. Wait for an explicit
        // UI transition, then verify this exact page in the completed queue section.
        await waitFor(() => {
            if (location.pathname.replace(/\/$/,'') === QUEUE) return snapshot();
            const text = normalize(main()?.textContent);
            const success = /okundu olarak isaretlendi|basariyla|tamamlandi/.test(text || '');
            return success && !buttons().some(isMark);
        }, `waiting for page ${n} completion response`);
        if (readerNumber() !== null) await goBack();
        const s = await waitFor(() => {
            const next = snapshot();
            if (!next) return false;
            if (BigInt(next.round) < BigInt(runRound)) return false;
            return newerRound(next.round, runRound) || next.states.get(n)?.state === 'completed' ? next : false;
        }, `verifying page ${n} in completed list`);
        if (newerRound(s.round, runRound)) {
            unverified++;
            log(`Page ${n}: submitted in hatim ${runRound}; round rolled over to ${s.round} before readback. Not retried or counted as verified.`, 'warning');
        } else {
            done++; log(`Page ${n}: completion verified in hatim ${runRound}.`, 'success');
        }
        clearCurrent();
        adoptRound(s);
        return true;
    }
    async function run(resume = null) {
        if (running || checking) return;
        if (resume?.schema !== 1) resume = null; // Ignore a button's MouseEvent.
        let pages;
        try { pages = resume ? resume.pages : parsePages($('pages').value); } catch(e) { status(e.message); return; }
        if (!resume && readerNumber() !== null) { status('Use Geri to return to the queue before starting.'); return; }
        if (!navigator.locks) { status('This browser needs Web Locks support to prevent overlapping runs.'); return; }
        running = true; leaving = false;
        if (resume) {
            mode = resume.mode; paused = !!resume.paused; stopped = !!resume.stopped;
            done = resume.done; skipped = resume.skipped; simulated = resume.simulated; unverified = resume.unverified;
            runRound = resume.round; current = resume.pending?.page ?? null;
            $('mode').value = mode; $('pages').value = resume.input;
            $('mode').onchange(); syncCuz();
            for (const entry of resume.logs || []) log(entry.message, entry.level, entry.time);
        } else {
            stopped = paused = false; mode = $('mode').value;
            done = skipped = simulated = unverified = 0; current = null;
        }
        runPages = pages; runIndex = resume ? resume.index : 0; total = pages.length; render();
        try {
            await navigator.locks.request(LOCK, {ifAvailable:true}, async lock => {
                if (!lock) throw Error('Another tab is running this script. Stop it first.');
                ownsLock = true;
                try {
                    // Test storage before any claim. Full navigation must be able to resume.
                    sessionStorage.setItem(RUN_KEY + '-probe', '1');
                    sessionStorage.removeItem(RUN_KEY + '-probe');
                    if (resume?.pending) {
                        const j = readJournal();
                        if (!j || j.page !== resume.pending.page || j.round !== resume.pending.round || j.phase !== resume.pending.phase) {
                            current = null; // Never clean up a reservation belonging to a different run.
                            throw Error('The saved reservation changed in another run. Return to the queue and Check availability.');
                        }
                    } else {
                        const s = await queueReady(readJournal()?.round); await recover(s); runRound = s.round;
                    }
                    localStorage.setItem(KEY, $('pages').value);
                    log(`${resume ? 'Resumed after navigation' : 'Started'} v1.5.0 ${mode.toUpperCase()} · hatim ${runRound} · ${pages.length} pages.`);
                    saveRun();
                    while (runIndex < pages.length) {
                        // A paused/stopped reload must settle its pending page first.
                        if (current === null && !await checkpoint()) break;
                        const result = await processPage(pages[runIndex]);
                        if (result !== false) runIndex++;
                        saveRun(); render();
                    }
                    status(stopped ? 'Stopped · no page held' : unverified ? `Finished · ${unverified} submission(s) unverified after round rollover; see activity.` : 'Finished');
                } catch(e) {
                    if (leaving) return;
                    if (stopped && current === null) { status('Stopped · no page held'); return; }
                    log(`STOPPED: ${e.message}`, 'error');
                    let cleanup = '';
                    if (current !== null) {
                        try {
                            if (readJournal()?.phase !== 'mark-sent') await release();
                            else cleanup = ' Completion uncertain; return to the queue and Check availability.';
                        } catch(releaseError) { cleanup = ` Cleanup unresolved: ${releaseError.message}`; log(cleanup, 'error'); }
                    }
                    status(e.message + cleanup);
                } finally {
                    if (!leaving) sessionStorage.removeItem(RUN_KEY);
                    ownsLock = false;
                }
            });
        } catch(e) {
            log(e.message, 'error'); status(e.message);
            if (!leaving) sessionStorage.removeItem(RUN_KEY);
        } finally { running = false; paused = false; render(); }
    }

    // Defense in depth: in Simulation, completion clicks are blocked even if a
    // future code change accidentally invokes the wrong control. During a run,
    // manual site interaction is blocked to prevent unrelated claims/navigation.
    document.addEventListener('click', e => {
        if (!running || e.composedPath().includes(host)) return;
        const b = e.target instanceof Element ? e.target.closest('button') : null;
        if ((mode === 'simulation' && b && isMark(b)) || e.isTrusted) {
            e.preventDefault(); e.stopImmediatePropagation();
        }
    }, true);
    // Do not install a beforeunload warning: the site may use normal navigation.
    // Persist BEFORE navigation clicks; pagehide also saves pause/stop and logs.
    window.addEventListener('pagehide', () => {
        saveRun();
        leaving = true;
    });
    function syncCuz() {
        const match = CUZ_RANGES.find(r => rangeText(r) === $('pages').value.trim());
        for (const r of CUZ_RANGES) {
            $('cuz-' + r.number).setAttribute('aria-pressed', String(r.number === match?.number));
        }
        $('cuzSelection').textContent = match ? `Cüz ${match.number} · pages ${match.first}–${match.last}` : 'Custom pages';
    }
    for (const selected of CUZ_RANGES) {
        $('cuz-' + selected.number).onclick = () => {
            if (running || checking) return;
            $('pages').value = rangeText(selected);
            syncCuz();
            status(`Cüz ${selected.number} selected · pages ${selected.first}–${selected.last}. Check availability or Start.`);
            log(`Selected Cüz ${selected.number}: pages ${selected.first}–${selected.last} (${selected.last - selected.first + 1} pages).`);
        };
    }
    $('pages').oninput = syncCuz;
    $('start').onclick = run;
    $('check').onclick = check;
    $('pause').onclick = () => { paused = !paused; status(paused ? 'Pausing · settling current page…' : 'Resuming…'); saveRun(); render(); };
    $('stop').onclick = () => { stopped = true; paused = false; status('Stopping · settling current page…'); saveRun(); render(); };
    $('mode').onchange = () => { $('modeNote').textContent = $('mode').value === 'real' ? 'Marks your already-read pages automatically.' : 'Test only · no pages marked.'; };
    $('fold').onclick = () => { $('body').hidden = !$('body').hidden; $('fold').textContent = $('body').hidden ? '+' : '−'; };
    try { $('pages').value = localStorage.getItem(KEY) || ''; if (readJournal()) status('Previous run unresolved · return to queue and Check availability.'); } catch(e) { status(`Storage unavailable: ${e.message}`); }
    syncCuz();
    const header = root.querySelector('header');
    let drag;
    header.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        const r = host.getBoundingClientRect(); drag = {x:e.clientX-r.left, y:e.clientY-r.top}; header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', e => {
        if (!drag) return;
        host.style.left = Math.max(0, Math.min(innerWidth-host.offsetWidth,e.clientX-drag.x))+'px';
        host.style.top = Math.max(0, Math.min(innerHeight-40,e.clientY-drag.y))+'px';
        host.style.right = host.style.bottom = 'auto';
    });
    header.addEventListener('pointerup', () => { drag = null; });
    header.addEventListener('pointercancel', () => { drag = null; });
    setInterval(() => { host.hidden = !relevant() && !running; }, 500);
    host.hidden = !relevant(); render();
    try {
        const saved = readSavedRun();
        if (saved && relevant()) Promise.resolve().then(() => run(saved));
    } catch(e) { status(e.message); log(e.message, 'error'); }
})();
