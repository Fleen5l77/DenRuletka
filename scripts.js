// Инициализация Telegram Web App (без фейлов при отсутствии)
try { window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.ready && window.Telegram.WebApp.ready(); } catch(e){ /* ignore */ }
try { window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.expand && window.Telegram.WebApp.expand(); } catch(e){ /* ignore */ }

// Конфигурация и глобальные переменные
const ROULETTE_ADDRESS = 'Dencoin-ruletka';
const MAX_SPINS_PER_DAY = 5000;
let coinBalance = parseInt(localStorage.getItem('coinBalance') || '5000', 10); // старт для теста
let usedCodes = JSON.parse(localStorage.getItem('usedCodes') || '[]');
let history = JSON.parse(localStorage.getItem('spinHistory') || '[]');

// Награды рулетки: type: 'win' (multiplier), 'jackpot' (big fixed), 'small' (fixed), 'lose'
const rewards = [
    { name: 'LOSE', type: 'lose', chance: 0.45, color: '#222' },
    { name: '+0.5x', type: 'mult', mult: 0.5, chance: 0.25, color: '#a6e22e' },
    { name: '+1x (save)', type: 'mult', mult: 1, chance: 0.15, color: '#66d9ef' },
    { name: '+2x', type: 'mult', mult: 2, chance: 0.1, color: '#f92672' },
    { name: 'JACKPOT +10x', type: 'mult', mult: 10, chance: 0.05, color: '#fd971f' }
];

// Вспомогательные элементы (инициализируются в init)
let canvas = null;
let ctx = null;
let confettiCanvas = null;
let confettiCtx = null;

function init() {
    // UI hookup
    // init canvas elements safely (may be absent on deposit/withdraw pages)
    canvas = document.getElementById('roulette');
    if (canvas) ctx = canvas.getContext('2d');

    updateBalance();
    drawRoulette();
    renderHistory();
    setupBetPresets();
    setupSpinButton();
    setupConfetti();
    setupSnow();
    setupGameTabs();
    setupCoinFlip();
    setupSlots();
    setupCrash();
    window.addEventListener('resize', resizeConfetti);
    window.addEventListener('resize', resizeRoulette);
    window.addEventListener('resize', resizeSnow);

    // Spin limit display
    const today = new Date().toDateString();
    const spinsToday = parseInt(localStorage.getItem(`spins_${today}`) || '0', 10);
    const limitEl = document.getElementById('spinLimit');
    if (limitEl) limitEl.innerText = `Лимит спинов: ${spinsToday}/${MAX_SPINS_PER_DAY}`;
    const spinBtn = document.getElementById('spinButton');
    if (spinBtn && spinsToday >= MAX_SPINS_PER_DAY) { spinBtn.disabled = true; }
    if (spinBtn && coinBalance <= 0) { spinBtn.disabled = true; }

    // default game
    try { switchGame('roulette'); } catch(e){}
}

// Обновление баланса
function updateBalance() {
    const balanceSpan = document.getElementById('balanceAmount');
    const balanceDiv = document.getElementById('coinBalance');
    if (balanceSpan) balanceSpan.innerText = coinBalance;
    if (balanceDiv) balanceDiv.innerText = `Баланс: ${coinBalance} Denis Coins`;
    const betInput = document.getElementById('betInput');
    if (betInput) betInput.max = Math.max(1, coinBalance || 1);
}

// Управление пресетами
function setupBetPresets() {
    document.querySelectorAll('.preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const mult = btn.dataset.mult;
            const betInput = document.getElementById('betInput');
            if (mult === 'max') {
                betInput.value = Math.max(1, coinBalance);
            } else {
                betInput.value = Math.max(1, Math.min(coinBalance, Math.floor(betInput.value * parseFloat(mult))));
            }
        });
    });
}

// Spin button hookup
function setupSpinButton() {
    const btn = document.getElementById('spinButton');
    if (!btn) return;
    btn.addEventListener('click', startSpin);
}

// Games: tabs and other games (coin flip, slots)
function setupGameTabs(){
    document.querySelectorAll('.game-tab').forEach(btn=>{
        btn.addEventListener('click', ()=> switchGame(btn.dataset.game));
    });
}
function switchGame(name){
    // if leaving crash while a round is running, end it
    if (name !== 'crash' && crashRunning) {
        const el = document.getElementById('crashMultiplier');
        const last = el ? parseFloat(el.innerText.replace('x','')) || 1 : 1;
        endCrash(false, last);
    }

    document.querySelectorAll('.game-panel').forEach(p=> p.classList.toggle('hidden', p.id !== name + 'Game'));
    document.querySelectorAll('.game-tab').forEach(t=> t.classList.toggle('active', t.dataset.game === name));

    // enable/disable start for crash based on balance
    if (name === 'crash') {
        const startBtn = document.getElementById('startCrashButton');
        if (startBtn) startBtn.disabled = coinBalance <= 0;
    }

    if(name === 'roulette') { if (canvas && ctx) drawRoulette(); }
}

// Coin flip
let coinChoice = 'heads';
function setupCoinFlip(){
    document.querySelectorAll('.coin-choice').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            document.querySelectorAll('.coin-choice').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            coinChoice = btn.dataset.choice;
        });
    });
    const btn = document.getElementById('flipButton');
    if (!btn) return;
    btn.addEventListener('click', startCoinFlip);
}
function startCoinFlip(){
    const bet = Math.max(1, Math.floor(parseInt(document.getElementById('betInput').value || '1', 10)));
    const resultDiv = document.getElementById('coinFlipResult');
    if (bet > coinBalance) { showAlert('Недостаточно монет!'); return; }
    coinBalance -= bet; localStorage.setItem('coinBalance', coinBalance); updateBalance();
    const flip = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = flip === coinChoice;
    let payout = 0;
    if (win) { payout = Math.floor(bet * 2); coinBalance += payout; localStorage.setItem('coinBalance', coinBalance); playWin(); triggerWinEffect(); safeHaptic('medium'); resultDiv.innerText = `Вы выиграли ${payout} DenKoin! (${flip})`; }
    else { playLose(); triggerLoseEffect(); safeHaptic('light'); resultDiv.innerText = `Вы проиграли ${bet} DenKoin. (${flip})`; }
    pushHistory({ time: Date.now(), game: 'coinflip', bet, reward: payout, outcome: flip });
    updateBalance();
}

// Slots
const slotSymbols = ['🍒','🍋','🔔','⭐','7'];
function setupSlots(){
    const btn = document.getElementById('slotsButton');
    if (!btn) return;
    btn.addEventListener('click', startSlots);
}
function startSlots(){
    const bet = Math.max(1, Math.floor(parseInt(document.getElementById('betInput').value || '1', 10)));
    const r1 = document.getElementById('reel1');
    const r2 = document.getElementById('reel2');
    const r3 = document.getElementById('reel3');
    const resultDiv = document.getElementById('slotsResult');
    if (bet > coinBalance) { showAlert('Недостаточно монет!'); return; }
    coinBalance -= bet; localStorage.setItem('coinBalance', coinBalance); updateBalance();

    // animate reels
    const durations = [900 + Math.random()*400, 1200 + Math.random()*400, 1600 + Math.random()*400];
    let stops = [];
    [r1,r2,r3].forEach((r,i)=>{
        if(!r) return; let tStart = Date.now();
        const iv = setInterval(()=>{ r.innerText = slotSymbols[Math.floor(Math.random()*slotSymbols.length)]; }, 60);
        setTimeout(()=>{
            clearInterval(iv);
            const sym = slotSymbols[Math.floor(Math.random()*slotSymbols.length)];
            r.innerText = sym; stops[i]=sym;
            // when last stopped, evaluate
            if(stops.filter(Boolean).length === 3) evaluateSlots(stops, bet);
        }, durations[i]);
    });
}
function evaluateSlots(stops, bet){
    const [a,b,c] = stops;
    let payout = 0;
    if (a === b && b === c) { payout = Math.floor(bet * 5); playWin(); triggerWinEffect(); safeHaptic('heavy'); }
    else if (a === b || b === c || a === c) { payout = Math.floor(bet * 1.5); playWin(); triggerWinEffect(); safeHaptic('medium'); }
    else { playLose(); triggerLoseEffect(); safeHaptic('light'); }
    if (payout) { coinBalance += payout; localStorage.setItem('coinBalance', coinBalance); }
    pushHistory({ time: Date.now(), game:'slots', bet, reward: payout, outcome: stops.join('|') });
    const resultDiv = document.getElementById('slotsResult');
    if (resultDiv) resultDiv.innerText = payout ? `Вы выиграли ${payout} DenKoin!` : `Вы проиграли ${bet} DenKoin.`;
    updateBalance();
}

// --- CRASH GAME ---
let crashRunning = false;
let crashTarget = 0;
let crashStartTime = 0;
let crashAnimId = null;
let currentCrashBet = 0;
let cashedOut = false;
let crashFallbackIntervalId = null; 

function setupCrash(){
    const start = document.getElementById('startCrashButton');
    const cash = document.getElementById('cashoutButton');
    if (start) start.addEventListener('click', startCrash);
    if (cash) cash.addEventListener('click', cashOutCrash);
    // ensure cashout disabled initially and visible
    if (cash) { cash.disabled = true; cash.classList.remove('hidden'); }
}

function getCrashPoint(){
    // повышаем вероятность разумно: чуть меньше мгновенных крашей, больше средних мультипликаторов
    const r = Math.random();
    if (r < 0.40) return Math.round((1 + Math.random() * 0.22) * 100) / 100; // 1.00 - 1.29 (common)
    if (r < 0.82) return Math.round((1.3 + Math.random() * 0.8) * 100) / 100; // 1.30 - 2.00 (увеличено)
    if (r < 0.97) return Math.round((2.0 + Math.random() * 3.0) * 100) / 100; // 2.00 - 4.00
    return Math.round((4.0 + Math.random() * 6.0) * 100) / 100; // редкие большие множители
}

function startCrash(){
    if (crashRunning) return;
    const bet = Math.max(1, Math.floor(parseInt(document.getElementById('betInput').value || '1', 10)));
    if (bet > coinBalance) { showAlert('Недостаточно монет!'); return; }
    coinBalance -= bet; localStorage.setItem('coinBalance', coinBalance); updateBalance();
    currentCrashBet = bet;
    crashTarget = getCrashPoint();
    crashRunning = true; cashedOut = false;
    crashStartTime = performance.now();
    document.getElementById('startCrashButton').disabled = true;
    const cashBtn = document.getElementById('cashoutButton');
    if (cashBtn) { cashBtn.disabled = true; cashBtn.classList.remove('can-cash'); cashBtn.classList.remove('hidden'); }
    // reset charge visuals
    const fillEl = document.getElementById('crashChargeFill');
    const rocketEl = document.getElementById('crashRocket');
    if (fillEl) fillEl.style.width = '0%';
    if (rocketEl) { rocketEl.classList.remove('crashed'); rocketEl.style.transform = 'translateY(0)'; }
    document.getElementById('crashResult').innerText = 'Идет раунд... удачи!';
    try {
        requestAnimationFrame(crashLoop);
        // fallback for environments where rAF may be throttled or unavailable (Telegram WebView)
        if (crashFallbackIntervalId) clearInterval(crashFallbackIntervalId);
        crashFallbackIntervalId = setInterval(()=>{ if (crashRunning) { try { crashLoop(performance.now()); } catch(e){ console.error('Crash fallback loop error', e); } } }, 120);
    } catch (e) {
        console.error('Failed to start crash loop', e);
        // refund bet
        coinBalance += bet; localStorage.setItem('coinBalance', coinBalance); updateBalance();
        crashRunning = false;
        document.getElementById('startCrashButton').disabled = coinBalance <= 0;
        showAlert('Не удалось запустить раунд: ограничение среды выполнения. Попробуйте ещё раз.');
    }
}

function crashLoop(now){
    try {
        if (!crashRunning) return;
        if (typeof now !== 'number') now = performance.now();
        const elapsed = (now - crashStartTime) / 1000;
        // exponential growth — tuned for visible acceleration
        const mult = Math.exp(0.6 * elapsed);
        const display = Math.max(1, mult);
        const el = document.getElementById('crashMultiplier');
        if (el) el.innerText = `x${display.toFixed(2)}`;
        // update charge bar and rocket position relative to crashTarget
        const fillEl = document.getElementById('crashChargeFill');
        const rocketEl = document.getElementById('crashRocket');
        let pct = 0;
        if (crashTarget > 1) pct = Math.min(1, (display - 1) / (crashTarget - 1));
        else pct = 1;
        if (fillEl) fillEl.style.width = `${Math.floor(pct*100)}%`;
        if (rocketEl) rocketEl.style.transform = `translateY(${Math.floor((1 - pct) * 6)}px)`;

        // enable cashout only after x1.3
        const cashBtn = document.getElementById('cashoutButton');
        if (display >= 1.3) {
            if (cashBtn && cashBtn.disabled) {
                cashBtn.disabled = false;
                cashBtn.classList.add('can-cash');
            }
        } else {
            if (cashBtn && !cashBtn.disabled) {
                cashBtn.disabled = true;
                cashBtn.classList.remove('can-cash');
            }
        }
        if (display >= crashTarget){
            // crashed: snap visuals
            if (fillEl) fillEl.style.width = '100%';
            if (rocketEl) rocketEl.classList.add('crashed');
            endCrash(false, display);
            return;
        }
        crashAnimId = requestAnimationFrame(crashLoop);
    } catch (e) {
        console.error('Crash loop error', e);
        const lastMult = parseFloat((document.getElementById('crashMultiplier')||{innerText:'x1'}).innerText.replace('x','')) || 1;
        endCrash(false, lastMult);
    }
}

function cashOutCrash(){
    if (!crashRunning || cashedOut) return;
    const el = document.getElementById('crashMultiplier');
    const currentMult = parseFloat((el && el.innerText.replace('x','')) || '1') || 1;
    if (currentMult < 1.3) { showAlert('Забрать можно только с коэффициентом x1.3 или выше'); return; }
    const payout = Math.floor(currentCrashBet * currentMult);
    coinBalance += payout; localStorage.setItem('coinBalance', coinBalance); updateBalance();
    cashedOut = true; crashRunning = false;
    cancelAnimationFrame(crashAnimId);
    if (crashFallbackIntervalId) { clearInterval(crashFallbackIntervalId); crashFallbackIntervalId = null; }
    document.getElementById('crashResult').innerText = `Вы забрали ${payout} DenKoin (x${currentMult.toFixed(2)})`;
    playWin(); triggerWinEffect(); safeHaptic('medium');
    const cashBtn = document.getElementById('cashoutButton'); if (cashBtn) { cashBtn.disabled = true; cashBtn.classList.remove('can-cash'); }
    document.getElementById('startCrashButton').disabled = coinBalance <= 0;
    pushHistory({ time: Date.now(), game:'crash', bet: currentCrashBet, reward: `x${currentMult.toFixed(2)}`, delta: payout });
}

function endCrash(won, lastMult){
    crashRunning = false;
    cancelAnimationFrame(crashAnimId);
    if (crashFallbackIntervalId) { clearInterval(crashFallbackIntervalId); crashFallbackIntervalId = null; }
    const cashBtn = document.getElementById('cashoutButton'); if (cashBtn) { cashBtn.disabled = true; cashBtn.classList.remove('can-cash'); }
    document.getElementById('startCrashButton').disabled = coinBalance <= 0 ? true : false;
    if (!cashedOut){
        // nobody cashed out — loss
        document.getElementById('crashResult').innerText = `КРАШ на x${lastMult.toFixed(2)} — вы потеряли ${currentCrashBet} DenKoin`;
        playLose(); triggerLoseEffect(); safeHaptic('light');
        pushHistory({ time: Date.now(), game:'crash', bet: currentCrashBet, reward: `x${lastMult.toFixed(2)}`, delta: 0 });
    }
    // reset multiplier display to at least show crash point for a moment
    const el = document.getElementById('crashMultiplier'); if (el) el.innerText = `x${Math.max(1,lastMult).toFixed(2)}`;
    const rocketEl = document.getElementById('crashRocket');
    if (rocketEl) {
        rocketEl.classList.add('crashed');
        setTimeout(()=>{ rocketEl.classList.remove('crashed'); if (rocketEl) rocketEl.style.transform = 'translateY(0)'; }, 800);
    }
}


// Draw roulette wheel
function drawRoulette() {
    if (!canvas || !ctx) return;
    const total = rewards.reduce((s, r) => s + r.chance, 0);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 8;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(cx, cy);
    let start = 0;
    ctx.font = '14px Arial';
    rewards.forEach(r => {
        const angle = (r.chance / total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = r.color;
        ctx.fill();
        // label
        ctx.save();
        ctx.rotate(start + angle / 2);
        ctx.fillStyle = '#000';
        ctx.fillText(r.name, radius * 0.6, 6);
        ctx.restore();
        start += angle;
    });
    ctx.restore();
}

// Start spin logic
let spinning = false;
function startSpin() {
    const bet = Math.max(1, Math.floor(parseInt(document.getElementById('betInput').value || '1', 10)));
    if (bet > coinBalance) { showAlert('Недостаточно монет!'); return; }

    // daily limit
    const today = new Date().toDateString();
    let spinsToday = parseInt(localStorage.getItem(`spins_${today}`) || '0', 10);
    if (spinsToday >= MAX_SPINS_PER_DAY) { showAlert('Лимит спинов на сегодня достигнут!'); return; }

    // take bet
    coinBalance -= bet;
    localStorage.setItem('coinBalance', coinBalance);
    updateBalance();

    spinsToday++;
    localStorage.setItem(`spins_${today}`, spinsToday);

    if (spinning) return;
    spinning = true;
    document.getElementById('spinButton').disabled = true;

    // rotation animation
    const duration = 2200 + Math.random() * 1600;
    const start = performance.now();
    const startAngle = Math.random() * Math.PI * 2;
    const rotations = 6 + Math.random() * 6;

    function animate(now) {
        const t = Math.min(1, (now - start) / duration);
        const angle = startAngle + easeOutCubic(t) * rotations * Math.PI * 2;
        if (ctx && canvas) {
            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(angle);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
            drawRoulette();
            ctx.restore();
            if (t < 1) requestAnimationFrame(animate);
            else finishSpin(bet);
        } else {
            // no canvas available — just finish after duration
            if (t < 1) requestAnimationFrame(animate);
            else finishSpin(bet);
        }
    }

    requestAnimationFrame(animate);
}

// Easing
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

// Finish spin: determine reward and apply
function finishSpin(bet) {
    const reward = getReward();
    let delta = 0;
    let message = '';

    if (reward.type === 'lose') {
        delta = 0;
        message = `ПРОИГРЫШ — потеря ${bet} DenKoin`;
        playLose();
        triggerLoseEffect();
    } else if (reward.type === 'mult') {
        const win = Math.floor(bet * reward.mult);
        delta = win;
        message = `Вы выиграли ${win} DenKoin (x${reward.mult})`;
        playWin();
        triggerWinEffect();
    }

    coinBalance += delta; // delta can be 0 or win
    localStorage.setItem('coinBalance', coinBalance);
    updateBalance();
    pushHistory({ time: Date.now(), bet, reward: reward.name, delta });
    showBigResult(message, reward.type !== 'lose');
    spinning = false;
    const spinBtn = document.getElementById('spinButton');
    if (spinBtn) spinBtn.disabled = coinBalance <= 0;
}

// Reward selection
function getReward() {
    const r = Math.random();
    let acc = 0;
    for (const item of rewards) {
        acc += item.chance;
        if (r <= acc) return item;
    }
    return rewards[rewards.length - 1];
}

// History
function pushHistory(entry) {
    history.unshift(entry);
    history = history.slice(0, 20);
    localStorage.setItem('spinHistory', JSON.stringify(history));
    renderHistory();
}

// renderHistory now shows game type and outcome if present
function renderHistory() {
    const ul = document.getElementById('historyList');
    if (!ul) return;
    ul.innerHTML = '';
    history.forEach(h => {
        const li = document.createElement('li');
        const d = new Date(h.time).toLocaleTimeString();
        const game = h.game ? `${h.game.toUpperCase()} — ` : '';
        const outcome = h.outcome ? ` (${h.outcome})` : '';
        li.innerText = `${d} — ${game}ставка ${h.bet} → ${h.reward}${outcome}`;
        ul.appendChild(li);
    });
}
function renderHistory() {
    const ul = document.getElementById('historyList');
    if (!ul) return;
    ul.innerHTML = '';
    history.forEach(h => {
        const li = document.createElement('li');
        const d = new Date(h.time).toLocaleTimeString();
        li.innerText = `${d} — ставка ${h.bet} → ${h.reward} (${h.delta})`;
        ul.appendChild(li);
    });
}

// Big result banner
let resultTimeout;
function showBigResult(msg, good) {
    const el = document.getElementById('bigResult');
    if (!el) return;
    el.classList.toggle('win', good);
    el.classList.toggle('lose', !good);
    el.innerText = msg;
    clearTimeout(resultTimeout);
    resultTimeout = setTimeout(() => { el.innerText = 'Сделай ставку и крути!'; el.classList.remove('win','lose'); }, 3500);
}

// Alerts and Telegram helpers (safe wrappers)
function showAlert(msg) {
    try {
        if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.showAlert === 'function') {
            try { window.Telegram.WebApp.showAlert(msg); return; } catch(e){ /* fallback */ }
        }
    } catch(e){ /* ignore */ }
    // fallback
    try { alert(msg); } catch(e) { console.log('Alert:', msg); }
}

function safeHaptic(type='light'){
    try {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.hapticFeedback && typeof window.Telegram.WebApp.hapticFeedback.impactOccurred === 'function') {
            window.Telegram.WebApp.hapticFeedback.impactOccurred(type);
        }
    } catch(e) { /* ignore */ }
}

function safeSetMainButton(text, onClick){
    try {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.MainButton) {
            const mb = window.Telegram.WebApp.MainButton;
            try { mb.setText && mb.setText(text); } catch(e){}
            try { mb.show && mb.show(); } catch(e){}
            try { if (onClick) { mb.onClick && mb.onClick(onClick); } } catch(e){}
        }
    } catch(e) { /* ignore */ }
}

// Visual effects: confetti
let confettiParticles = [];
function setupConfetti() {
    confettiCanvas = document.getElementById('confetti');
    if (!confettiCanvas) return;
    confettiCtx = confettiCanvas.getContext('2d');
    resizeConfetti();
    requestAnimationFrame(confettiLoop);
}

// --- SNOW overlay: sparse, tilted, semi-transparent and random ---
let snowCanvas = null;
let snowCtx = null;
let snowParticles = [];
const SNOW_COUNT = 40; // sparse

function setupSnow(){
    snowCanvas = document.getElementById('snowCanvas');
    if (!snowCanvas) return;
    snowCtx = snowCanvas.getContext('2d');
    createSnowParticles();
    resizeSnow();
    requestAnimationFrame(snowLoop);
}

function createSnowParticles(){
    snowParticles = [];
    for(let i=0;i<SNOW_COUNT;i++){
        snowParticles.push(makeSnowParticle(true));
    }
}

function makeSnowParticle(init=false){
    const w = window.innerWidth * 1.2; // match rotated canvas coverage
    const h = window.innerHeight * 1.2;
    return {
        x: Math.random() * w,
        y: init ? Math.random() * h : -10 - Math.random() * h * 0.25,
        r: 1 + Math.random() * 3, // small flakes
        vy: 0.5 + Math.random() * 1.2,
        vx: (Math.random() - 0.2) * 0.6, // bias to the right (tilted fall)
        alpha: 0.25 + Math.random() * 0.7
    };
}

function snowLoop(){
    if (!snowCtx || !snowCanvas) return;
    const w = snowCanvas.width;
    const h = snowCanvas.height;
    snowCtx.clearRect(0,0,w,h);
    for(let i=snowParticles.length-1;i>=0;i--){
        const p = snowParticles[i];
        snowCtx.globalAlpha = p.alpha * 0.9;
        snowCtx.fillStyle = 'white';
        snowCtx.beginPath();
        snowCtx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        snowCtx.fill();
        p.x += p.vx + Math.sin(p.y * 0.01) * 0.2; // slight wobble
        p.y += p.vy;
        // respawn when out of view (allow margin)
        if (p.y > h + 20 || p.x < -50 || p.x > w + 50){
            snowParticles[i] = makeSnowParticle(false);
        }
    }
    requestAnimationFrame(snowLoop);
}

function resizeSnow(){
    if(!snowCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    snowCanvas.width = Math.floor(window.innerWidth * 1.2 * dpr);
    snowCanvas.height = Math.floor(window.innerHeight * 1.2 * dpr);
    snowCanvas.style.width = Math.floor(window.innerWidth * 1.2) + 'px';
    snowCanvas.style.height = Math.floor(window.innerHeight * 1.2) + 'px';
    if(snowCtx) snowCtx.setTransform(dpr,0,0,dpr,0,0);
}

// Hook into init resize handling
// call setupSnow in init()


// Make roulette canvas responsive on resize
function resizeRoulette(){
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let size = Math.min(rect.width || (window.innerWidth * 0.5), window.innerWidth * 0.9);
    if (!size || size < 50) {
        // canvas may be hidden or zero-sized (tabs). fallback to parent width or sane default
        const parent = canvas.parentElement || document.body;
        const parentWidth = parent.clientWidth || window.innerWidth;
        size = Math.min(360, Math.max(200, parentWidth * 0.6, window.innerWidth * 0.45));
    }
    // set device pixels for crispness
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size * dpr));
    canvas.height = Math.max(1, Math.floor(size * dpr));
    canvas.style.width = `${Math.floor(size)}px`;
    canvas.style.height = `${Math.floor(size)}px`;
    if (ctx) {
        ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    drawRoulette();
}

function resizeConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    resizeRoulette();
}
function resizeConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}
function triggerWinEffect(){
    createConfetti(70);
}
function triggerLoseEffect(){
    createConfetti(10, true);
}
function createConfetti(count, dark=false){
    for(let i=0;i<count;i++){
        confettiParticles.push({
            x: Math.random()*confettiCanvas.width,
            y: -10 - Math.random()*200,
            vx: (Math.random()-0.5)*6,
            vy: 2+Math.random()*6,
            size: 4+Math.random()*8,
            color: dark ? '#555' : `hsl(${Math.random()*360},80%,60%)`,
            rot: Math.random()*360,
        });
    }
}
function confettiLoop(){
    confettiCtx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
    for(let i=confettiParticles.length-1;i>=0;i--){
        const p = confettiParticles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += 5;
        confettiCtx.save();
        confettiCtx.translate(p.x,p.y);
        confettiCtx.rotate(p.rot*Math.PI/180);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);
        confettiCtx.restore();
        if(p.y>confettiCanvas.height+50 || p.x<-50 || p.x>confettiCanvas.width+50) confettiParticles.splice(i,1);
    }
    requestAnimationFrame(confettiLoop);
}

// Sounds (fallback synth)
function playWin(){
    const s = document.getElementById('winSound');
    if(s && s.play) { s.currentTime = 0; s.play().catch(()=>synthBeep(600,0.25)); return; }
    synthBeep(600,0.25);
}
function playLose(){
    const s = document.getElementById('loseSound');
    if(s && s.play) { s.currentTime = 0; s.play().catch(()=>synthBeep(150,0.18)); return; }
    synthBeep(150,0.18);
}
function synthBeep(freq, dur){
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        setTimeout(()=>{ o.stop(); ctx.close(); }, dur*1000 + 100);
    } catch(e){ /* no sound */ }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

/* Сохранённые старые функции (submitCode / withdrawCoins) можно оставить ниже, без изменений; они работают с DenCoins и локальным хранилищем. */

// --- оставляем submitCode и withdrawCoins (см. ранее) ---

function submitCode() {
    const code = document.getElementById('codeInput') ? document.getElementById('codeInput').value : '';
    const password = document.getElementById('passwordInput') ? document.getElementById('passwordInput').value : '';
    const resultDiv = document.getElementById('result') || { innerText: '' };

    try {
        const [base64Part, uniqueCode] = code.split('-');
        if (!base64Part || !uniqueCode || uniqueCode.length !== 4 || isNaN(uniqueCode)) {
            resultDiv.innerText = 'Неверный формат кода.';
            showAlert('Неверный формат кода.');
            return;
        }
        if (usedCodes.includes(uniqueCode)) {
            resultDiv.innerText = 'Этот код уже использован.';
            showAlert('Этот код уже использован.');
            return;
        }
        let decodedData;
        try { decodedData = JSON.parse(atob(base64Part)); }
        catch (e) { resultDiv.innerText = 'Ошибка декодирования кода.'; showAlert('Ошибка декодирования кода.'); return; }
        const { recipientId, amount, password: codePassword, senderId } = decodedData;
        if (!recipientId || !amount || !codePassword || !senderId) {
            resultDiv.innerText = 'Неверная структура данных в коде.';
            showAlert('Неверная структура данных в коде.');
            return;
        }
        // Сравнение адреса делаем регистронезависимым и без лишних пробелов
        const normalizedRecipient = String(recipientId).trim().toLowerCase();
        const expectedRecipient = String(ROULETTE_ADDRESS).trim().toLowerCase();
        if (normalizedRecipient !== expectedRecipient) {
            resultDiv.innerText = `Код предназначен для ${recipientId}. Для зачисления нужен адрес: ${ROULETTE_ADDRESS} (регистр не важен).`;
            showAlert(`Неверный адрес назначения. Ожидаемый адрес: ${ROULETTE_ADDRESS} (регистр игнорируется).`);
            return;
        }
        if (codePassword !== password) {
            resultDiv.innerText = 'Неверный пароль.';
            showAlert('Неверный пароль.');
            return;
        }
        if (amount <= 0) { resultDiv.innerText = 'Сумма должна быть больше 0.'; showAlert('Сумма должна быть больше 0.'); return; }
        usedCodes.push(uniqueCode);
        localStorage.setItem('usedCodes', JSON.stringify(usedCodes));
        coinBalance += amount;
        localStorage.setItem('coinBalance', coinBalance);
        updateBalance();
        resultDiv.innerText = `Зачислено ${amount} Denis Coins!`;
        showAlert(`Успешно зачислено ${amount} монет!`);
        safeHaptic('medium');
    } catch (error) {
        resultDiv.innerText = 'Произошла ошибка. Проверьте код и попробуйте снова.';
        showAlert('Произошла ошибка.');
        console.error(error);
    }
}

function withdrawCoins() {
    const recipientEl = document.getElementById('recipientInput');
    const amountEl = document.getElementById('amountInput');
    const passwordEl = document.getElementById('passwordInput');
    const resultDiv = document.getElementById('result') || { innerText: '' };
    const recipient = recipientEl ? recipientEl.value : '';
    const amount = amountEl ? parseInt(amountEl.value) : 0;
    const password = passwordEl ? passwordEl.value : '';

    if (!recipient || !amount || !password) { resultDiv.innerText = 'Заполните все поля.'; showAlert('Заполните все поля.'); return; }
    if (amount <= 0) { resultDiv.innerText = 'Сумма должна быть больше 0.'; showAlert('Сумма должна быть больше 0.'); return; }
    if (amount > coinBalance) { resultDiv.innerText = 'Недостаточно монет.'; showAlert('Недостаточно монет.'); return; }

    const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();
    const data = { recipientId: recipient, amount: amount, password: password, senderId: ROULETTE_ADDRESS };
    const code = `${btoa(JSON.stringify(data))}-${uniqueCode}`;
    coinBalance -= amount;
    localStorage.setItem('coinBalance', coinBalance);
    updateBalance();
    resultDiv.innerText = `Ваш код для вывода: ${code}`;
    showAlert(`Код для вывода: ${code}`);
    safeHaptic('medium');
}
