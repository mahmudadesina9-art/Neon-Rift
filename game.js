(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ACCOUNT_STORE_KEY = 'neon-rift-accounts-v1';
  const SESSION_KEY = 'neon-rift-pilot';
  const PASSWORD_ITERATIONS = 120000;
  const ui = {
    score: $('score-value'), time: $('time-value'), kills: $('kills-value'),
    best: $('best-value'), wave: $('wave-value'), level: $('level-value'),
    xpText: $('xp-text'), xpBar: $('xp-bar'), healthText: $('health-text'),
    healthBar: $('health-bar'), start: $('start-overlay'), pause: $('pause-overlay'),
    upgrade: $('upgrade-overlay'), gameover: $('gameover-overlay'),
    stageComplete: $('stage-complete-overlay'), stageCompleteTitle: $('stage-complete-title'),
    nextStage: $('next-stage-button'),
    finalTime: $('final-time'), finalKills: $('final-kills'), finalScore: $('final-score'),
    options: $('upgrade-options'), mobile: $('mobile-controls'), knob: $('joystick-knob'),
    dash: $('dash-button'), toast: $('game-toast'),
    accountOverlay: $('account-overlay'), accountButton: $('account-button'),
    signedOut: $('signed-out-view'), signedIn: $('signed-in-view'),
    accountForm: $('account-form'), accountMessage: $('account-message'),
    accountSubmit: $('account-submit'), username: $('username-input'),
    password: $('password-input'), signinTab: $('signin-tab'), signupTab: $('signup-tab'),
    pilotName: $('pilot-name'), progressBest: $('progress-best'),
    progressRuns: $('progress-runs'), progressKills: $('progress-kills'),
    progressSurvival: $('progress-survival'), leaderboard: $('leaderboard-list'),
    leaderboardEmpty: $('leaderboard-empty')
  };

  const UPGRADES = [
    { id: 'damage', icon: '✧', name: 'Heavy rounds', description: 'Deal 30% more damage.', apply: (p) => { p.damage *= 1.3; } },
    { id: 'rapid', icon: '⌁', name: 'Rapid fire', description: 'Fire 22% faster.', apply: (p) => { p.fireRate *= .78; } },
    { id: 'speed', icon: '➤', name: 'Thrusters', description: 'Move 15% faster.', apply: (p) => { p.speed *= 1.15; } },
    { id: 'hull', icon: '⬡', name: 'Reinforced hull', description: 'Restore 35 hull and raise max hull by 10.', apply: (p) => { p.maxHealth += 10; p.health = Math.min(p.maxHealth, p.health + 35); } },
    { id: 'magnet', icon: '✦', name: 'Energy magnet', description: 'Collect shards from farther away.', apply: (p) => { p.magnet += 35; } },
    { id: 'pierce', icon: '⟡', name: 'Piercing shot', description: 'Shots pass through one extra hostile.', apply: (p) => { p.pierce += 1; } }
  ];

  const state = {
    mode: 'start', width: 0, height: 0, dpr: 1, last: 0, elapsed: 0,
    score: 0, kills: 0, stage: 1, stageKills: 0, wave: 1, spawnClock: 0, fireClock: 0,
    enemies: [], bullets: [], shards: [], pickups: [], particles: [], keys: new Set(),
    hostileBullets: [], bossSpawned: false, bossWarningShown: false, bossSpawnTimer: null,
    joystick: { x: 0, y: 0 }, sound: true, toastTimer: 0,
    player: null, audio: null, best: Number(localStorage.getItem('neon-rift-best') || 0),
    accountKey: null, accountMode: 'signin'
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (state.player) {
      state.player.x = Math.max(18, Math.min(state.width - 18, state.player.x));
      state.player.y = Math.max(18, Math.min(state.height - 18, state.player.y));
    }
  }
  new ResizeObserver(resize).observe(canvas);

  function freshPlayer() {
    return {
      x: state.width / 2, y: state.height / 2, radius: 10, speed: 205,
      health: 100, maxHealth: 100, damage: 1, fireRate: .42, magnet: 58, pierce: 0,
      invulnerable: 0, dashTime: 0, dashCooldown: 0, dashVector: { x: 0, y: -1 },
      level: 1, xp: 0, nextXp: 5
    };
  }

  function startGame() {
    state.mode = 'playing';
    state.elapsed = 0; state.score = 0; state.kills = 0;
    state.stage = 1; state.stageKills = 0; state.wave = 1;
    state.spawnClock = .5; state.fireClock = .1;
    state.enemies = []; state.bullets = []; state.hostileBullets = [];
    state.shards = []; state.pickups = []; state.particles = [];
    state.bossSpawned = false; state.bossWarningShown = false; state.bossSpawnTimer = null;
    state.keys.clear(); state.joystick.x = 0; state.joystick.y = 0;
    state.player = freshPlayer();
    ui.start.classList.add('hidden'); ui.pause.classList.add('hidden');
    ui.upgrade.classList.add('hidden'); ui.gameover.classList.add('hidden');
    ui.stageComplete.classList.add('hidden');
    ui.mobile.classList.remove('disabled');
    ui.dash.disabled = false;
    announce('LEVEL 1 — SURVIVE THE BREACH.');
    updateHud();
    state.last = performance.now();
  }

  function pauseGame() {
    if (state.mode === 'playing') {
      state.mode = 'paused'; ui.pause.classList.remove('hidden');
      updateHud();
    } else if (state.mode === 'paused') {
      state.mode = 'playing'; ui.pause.classList.add('hidden'); state.last = performance.now();
      updateHud();
    }
  }

  function gameOver() {
    state.mode = 'gameover';
    ui.gameover.classList.remove('hidden');
    ui.mobile.classList.add('disabled');
    ui.dash.disabled = true;
    ui.finalTime.textContent = formatTime(state.elapsed);
    ui.finalKills.textContent = state.kills;
    ui.finalScore.textContent = state.score.toLocaleString();
    if (state.accountKey) {
      try {
        saveAccountRun();
      } catch (error) {
        console.error('Unable to save this pilot run.', error);
        announce('RUN FINISHED — PROFILE SAVE FAILED');
      }
    } else if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem('neon-rift-best', String(state.best));
    }
    updateHud();
  }

  function completeStage() {
    state.mode = 'levelcomplete';
    state.enemies = [];
    state.bullets = [];
    state.hostileBullets = [];
    state.keys.clear();
    state.joystick.x = 0;
    state.joystick.y = 0;
    ui.pause.classList.add('hidden');
    ui.upgrade.classList.add('hidden');
    ui.gameover.classList.add('hidden');
    ui.stageCompleteTitle.textContent = `LEVEL ${state.stage} CLEARED`;
    ui.nextStage.textContent = `ENTER LEVEL ${state.stage + 1}`;
    ui.stageComplete.classList.remove('hidden');
    ui.mobile.classList.add('disabled');
    ui.dash.disabled = true;
    ui.nextStage.focus();
    updateHud();
  }

  function startNextStage() {
    if (state.mode !== 'levelcomplete') return;
    state.stage++;
    state.stageKills = 0;
    state.wave = state.stage;
    state.bossSpawned = false;
    state.bossWarningShown = false;
    state.bossSpawnTimer = null;
    state.spawnClock = .6;
    state.fireClock = .1;
    state.enemies = [];
    state.bullets = [];
    state.hostileBullets = [];
    state.mode = 'playing';
    ui.stageComplete.classList.add('hidden');
    ui.mobile.classList.remove('disabled');
    state.last = performance.now();
    announce(`LEVEL ${state.stage} — THE RIFT GROWS STRONGER`);
    updateHud();
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function readAccountStore() {
    const stored = localStorage.getItem(ACCOUNT_STORE_KEY);
    if (!stored) return { version: 1, users: {} };
    let store;
    try {
      store = JSON.parse(stored);
    } catch (error) {
      console.error('Unable to parse saved pilot profiles.', error);
      throw new Error('Saved profiles could not be read. Clear this browser’s Neon Rift site data to reset them.');
    }
    if (!store || store.version !== 1 || !store.users || typeof store.users !== 'object') {
      throw new Error('Saved profiles have an unsupported format. Clear this browser’s Neon Rift site data to reset them.');
    }
    return store;
  }

  function saveAccountStore(store) {
    localStorage.setItem(ACCOUNT_STORE_KEY, JSON.stringify(store));
  }

  function normalizeUsername(username) {
    return username.trim().toLowerCase();
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password, saltHex) {
    if (!crypto.subtle) throw new Error('Password protection is unavailable in this browser. Open the game on localhost or HTTPS.');
    const salt = Uint8Array.from(saltHex.match(/.{2}/g), (byte) => parseInt(byte, 16));
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return bytesToHex(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, material, 256
    ));
  }

  function sameHash(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
  }

  function getSignedInAccount() {
    if (!state.accountKey) return null;
    const store = readAccountStore();
    return Object.hasOwn(store.users, state.accountKey) ? store.users[state.accountKey] : null;
  }

  function setAccount(key) {
    state.accountKey = key;
    sessionStorage.setItem(SESSION_KEY, key);
    const account = getSignedInAccount();
    state.best = account.stats.bestScore;
    updateAccountUI();
    updateHud();
  }

  function updateAccountUI() {
    const account = getSignedInAccount();
    const signedIn = Boolean(account);
    ui.signedOut.classList.toggle('hidden', signedIn);
    ui.signedIn.classList.toggle('hidden', !signedIn);
    const ranked = Object.entries(readAccountStore().users)
      .sort(([, a], [, b]) => b.stats.bestScore - a.stats.bestScore
        || b.stats.bestSurvival - a.stats.bestSurvival
        || a.username.localeCompare(b.username))
      .slice(0, 10);
    ui.leaderboard.replaceChildren();
    ui.leaderboardEmpty.classList.toggle('hidden', ranked.length > 0);
    ui.leaderboardEmpty.textContent = signedIn
      ? 'Play a run to claim your place on the board.'
      : 'Create a pilot profile and play a run to claim your place.';
    for (const [index, [key, entry]] of ranked.entries()) {
      const item = document.createElement('li');
      item.className = key === state.accountKey ? 'leaderboard-entry current-pilot' : 'leaderboard-entry';
      const rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'leaderboard-name';
      name.textContent = entry.username;
      const score = document.createElement('strong');
      score.className = 'leaderboard-score';
      score.textContent = entry.stats.bestScore.toLocaleString();
      item.append(rank, name, score);
      ui.leaderboard.append(item);
    }
    ui.accountButton.textContent = signedIn ? `PILOT: ${account.username}` : 'SIGN IN';
    if (!signedIn) return;
    ui.pilotName.textContent = account.username;
    ui.progressBest.textContent = account.stats.bestScore.toLocaleString();
    ui.progressRuns.textContent = account.stats.runs.toLocaleString();
    ui.progressKills.textContent = account.stats.totalKills.toLocaleString();
    ui.progressSurvival.textContent = formatTime(account.stats.bestSurvival);
  }

  function saveAccountRun() {
    const store = readAccountStore();
    const account = store.users[state.accountKey];
    if (!account) {
      state.accountKey = null;
      sessionStorage.removeItem(SESSION_KEY);
      updateAccountUI();
      return;
    }
    account.stats.runs++;
    account.stats.totalKills += state.kills;
    account.stats.bestScore = Math.max(account.stats.bestScore, state.score);
    account.stats.bestSurvival = Math.max(account.stats.bestSurvival, Math.floor(state.elapsed));
    saveAccountStore(store);
    state.best = account.stats.bestScore;
    updateAccountUI();
  }

  function showAccountMessage(message, isError = true) {
    ui.accountMessage.textContent = message;
    ui.accountMessage.classList.toggle('error', isError);
  }

  function openAccountPanel() {
    updateAccountUI();
    showAccountMessage('');
    if (state.mode === 'playing') pauseGame();
    ui.accountOverlay.classList.remove('hidden');
    if (state.accountKey) $('account-title').textContent = 'Your place in the rift';
    else $('account-title').textContent = 'Sign in or create a pilot';
  }

  function closeAccountPanel() {
    ui.accountOverlay.classList.add('hidden');
  }

  function setAccountMode(mode) {
    state.accountMode = mode;
    const signin = mode === 'signin';
    ui.signinTab.classList.toggle('active', signin);
    ui.signupTab.classList.toggle('active', !signin);
    ui.signinTab.setAttribute('aria-selected', String(signin));
    ui.signupTab.setAttribute('aria-selected', String(!signin));
    ui.accountSubmit.innerHTML = signin ? 'SIGN IN <span>↗</span>' : 'CREATE PROFILE <span>↗</span>';
    ui.password.autocomplete = signin ? 'current-password' : 'new-password';
    showAccountMessage('');
  }

  async function submitAccount(event) {
    event.preventDefault();
    const username = ui.username.value.trim();
    const key = normalizeUsername(username);
    const password = ui.password.value;
    if (!/^[A-Za-z0-9_-]{3,16}$/.test(username)) {
      showAccountMessage('Use 3–16 letters, numbers, hyphens, or underscores.');
      return;
    }
    if (password.length < 8) {
      showAccountMessage('Use a password with at least 8 characters.');
      return;
    }
    ui.accountSubmit.disabled = true;
    showAccountMessage(state.accountMode === 'signin' ? 'Checking pilot credentials…' : 'Creating your pilot profile…', false);
    try {
      const store = readAccountStore();
      if (state.accountMode === 'signup') {
        if (Object.hasOwn(store.users, key)) {
          showAccountMessage('That username is already taken on this browser.');
          return;
        }
        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        Object.defineProperty(store.users, key, {
          value: {
            username, salt, passwordHash,
            stats: { bestScore: 0, runs: 0, totalKills: 0, bestSurvival: 0 }
          },
          enumerable: true,
          configurable: true,
          writable: true
        });
        saveAccountStore(store);
        setAccount(key);
        showAccountMessage('Profile created. Welcome to the breach!', false);
      } else {
        const account = Object.hasOwn(store.users, key) ? store.users[key] : null;
        if (!account) {
          showAccountMessage('No pilot with that username exists on this browser.');
          return;
        }
        const candidate = await hashPassword(password, account.salt);
        if (!sameHash(candidate, account.passwordHash)) {
          showAccountMessage('That password did not match this pilot.');
          return;
        }
        setAccount(key);
        showAccountMessage(`Welcome back, ${account.username}.`, false);
      }
      ui.accountForm.reset();
      window.setTimeout(closeAccountPanel, 700);
    } catch (error) {
      console.error('Pilot account operation failed.', error);
      showAccountMessage(error instanceof Error ? error.message : 'Could not save this pilot profile. Check browser storage settings.');
    } finally {
      ui.accountSubmit.disabled = false;
    }
  }

  function signOut() {
    state.accountKey = null;
    sessionStorage.removeItem(SESSION_KEY);
    state.best = Number(localStorage.getItem('neon-rift-best') || 0);
    updateAccountUI();
    updateHud();
    setAccountMode('signin');
  }

  function restoreAccountSession() {
    const key = sessionStorage.getItem(SESSION_KEY);
    if (!key) return;
    const store = readAccountStore();
    if (store.users[key]) setAccount(key);
    else sessionStorage.removeItem(SESSION_KEY);
  }

  function updateHud() {
    const p = state.player;
    ui.score.textContent = String(state.score).padStart(6, '0');
    ui.time.textContent = formatTime(state.elapsed);
    ui.kills.textContent = state.kills;
    ui.best.textContent = String(state.best).padStart(6, '0');
    ui.wave.textContent = state.wave;
    if (!p) return;
    ui.level.textContent = p.level;
    ui.xpText.textContent = `${p.xp} / ${p.nextXp} XP`;
    ui.xpBar.style.width = `${Math.min(100, p.xp / p.nextXp * 100)}%`;
    const health = Math.max(0, p.health / p.maxHealth * 100);
    ui.healthText.textContent = `${Math.ceil(health)}%`;
    ui.healthBar.style.width = `${health}%`;
    ui.healthBar.style.background = health < 30 ? '#ff558f' : '';
    const dashReady = p.dashCooldown <= 0 && state.mode === 'playing';
    ui.dash.disabled = !dashReady;
    ui.dash.querySelector('b').textContent = dashReady ? 'READY' : `${Math.ceil(p.dashCooldown)}s`;
    ui.dash.classList.toggle('ready', dashReady);
    const boss = state.enemies.find((enemy) => enemy.type === 'boss');
    const bossHud = $('boss-health');
    bossHud.classList.toggle('hidden', !boss);
    if (boss) {
      const bossHealth = Math.max(0, boss.health / boss.maxHealth * 100);
      $('boss-health-text').textContent = `${Math.ceil(bossHealth)}%`;
      $('boss-health-bar').style.width = `${bossHealth}%`;
    }
  }

  function announce(message, duration = 1.8, emphasis = false) {
    ui.toast.textContent = message;
    ui.toast.classList.toggle('boss-warning', emphasis);
    ui.toast.classList.add('visible');
    state.toastTimer = duration;
  }

  function dash() {
    const p = state.player;
    if (!p || state.mode !== 'playing' || p.dashCooldown > 0) return;
    let dx = (state.keys.has('ArrowRight') || state.keys.has('KeyD') ? 1 : 0) - (state.keys.has('ArrowLeft') || state.keys.has('KeyA') ? 1 : 0) + state.joystick.x;
    let dy = (state.keys.has('ArrowDown') || state.keys.has('KeyS') ? 1 : 0) - (state.keys.has('ArrowUp') || state.keys.has('KeyW') ? 1 : 0) + state.joystick.y;
    let length = Math.hypot(dx, dy);
    if (!length && state.enemies.length) {
      const closest = state.enemies.reduce((nearest, enemy) =>
        !nearest || Math.hypot(enemy.x - p.x, enemy.y - p.y) < Math.hypot(nearest.x - p.x, nearest.y - p.y) ? enemy : nearest, null);
      dx = p.x - closest.x;
      dy = p.y - closest.y;
      length = Math.hypot(dx, dy);
    }
    if (!length) { dx = 0; dy = -1; length = 1; }
    p.dashVector = { x: dx / length, y: dy / length };
    p.dashTime = .2;
    p.dashCooldown = 3;
    p.invulnerable = Math.max(p.invulnerable, .3);
    burst(p.x, p.y, '#5ff5e2', 12);
    announce('PHASE DASH — INVULNERABLE');
    playTone(320, .12, 'sawtooth', .035);
    updateHud();
  }

  function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    const margin = 22;
    const x = side === 0 ? -margin : side === 1 ? state.width + margin : Math.random() * state.width;
    const y = side === 2 ? -margin : side === 3 ? state.height + margin : Math.random() * state.height;
    const roll = Math.random();
    const type = state.wave >= 2 && roll < .16 ? 'soldier'
      : state.elapsed > 30 && roll < .28 ? 'brute'
        : roll < .42 ? 'runner' : 'drone';
    const stats = type === 'brute'
      ? { radius: 15, health: 4, speed: 36 + state.wave * 2, damage: 22, color: '#ff9a56', score: 35 }
      : type === 'soldier'
        ? { radius: 12, health: 3, speed: 42 + state.wave, damage: 12, color: '#ff7c53', score: 30 }
      : type === 'runner'
        ? { radius: 8, health: 1, speed: 86 + state.wave * 3, damage: 12, color: '#e764ff', score: 15 }
        : { radius: 11, health: 2, speed: 52 + state.wave * 2, damage: 16, color: '#ff558f', score: 20 };
    state.enemies.push({
      x, y, ...stats, maxHealth: stats.health, type, hitFlash: 0,
      fireClock: type === 'soldier' ? .6 + Math.random() * .8 : Infinity,
      muzzleFlash: 0
    });
  }

  function spawnBoss() {
    const level = state.stage;
    const x = state.width / 2;
    const y = -30;
    const health = 42 + (level - 1) * 24;
    state.enemies.push({
      x, y, type: 'boss', radius: Math.min(17 + (level - 1) * 1.4, 29), health, maxHealth: health,
      speed: Math.min(27 + level * 5, 58), damage: 24 + Math.min(level * 2, 16), color: '#ff3f78',
      score: 500 + (level - 1) * 100, hitFlash: 0,
      fireClock: Math.max(.55, 1.55 - (level - 1) * .1), muzzleFlash: 0,
      phase: Math.random() * Math.PI * 2
    });
    const soldierCount = Math.min(level, 6);
    for (let index = 0; index < soldierCount; index++) {
      const angle = index * Math.PI * 2 / soldierCount;
      const soldierHealth = 2 + Math.floor((level - 1) / 2);
      state.enemies.push({
        x: x + Math.cos(angle) * 38, y: 15 + Math.sin(angle) * 30,
        type: 'soldier', radius: Math.min(10 + level * .4, 14), health: soldierHealth,
        maxHealth: soldierHealth, speed: Math.min(40 + level * 3, 64),
        damage: 10 + Math.min(level, 10), color: '#ff9a56', score: 30 + (level - 1) * 5, hitFlash: 0,
        fireClock: .7 + index * .25, muzzleFlash: 0, escort: true
      });
    }
    state.bossSpawned = true;
    announce(`LEVEL ${level} FINAL BOSS — ${soldierCount} ESCORT${soldierCount === 1 ? '' : 'S'} INBOUND!`);
    playTone(95, .55, 'sawtooth', .045);
  }

  function fireEnemy(enemy, player) {
    if (state.hostileBullets.length > 120) return;
    const lead = enemy.type === 'boss' ? .16 : .1;
    const targetX = player.x + (player.vx || 0) * lead;
    const targetY = player.y + (player.vy || 0) * lead;
    const baseAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    const level = state.stage;
    const speed = enemy.type === 'boss' ? 165 + level * 8 : 145 + level * 5;
    const bossShotCount = Math.min(level, 5);
    const spread = enemy.type === 'boss'
      ? Array.from({ length: bossShotCount }, (_, index) => (index - (bossShotCount - 1) / 2) * .14)
      : [0];
    for (const offset of spread) {
      const angle = baseAngle + offset;
      state.hostileBullets.push({
        x: enemy.x + Math.cos(angle) * (enemy.radius + 4),
        y: enemy.y + Math.sin(angle) * (enemy.radius + 4),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: enemy.type === 'boss' ? Math.min(4 + level * .35, 6) : 4,
        damage: enemy.type === 'boss' ? 7 + Math.min(level, 10) : 7 + Math.min(level, 8),
        color: enemy.type === 'boss' ? '#ff4b75' : '#ffae59',
        life: 3.2
      });
    }
    enemy.muzzleFlash = .12;
    playTone(enemy.type === 'boss' ? 190 : 300, .06, 'square', .012);
  }

  function damagePlayer(damage, source) {
    const player = state.player;
    if (source !== 'projectile' && player.invulnerable > 0) return false;
    player.health = Math.max(0, player.health - damage);
    if (source !== 'projectile') player.invulnerable = .65;
    burst(player.x, player.y, source === 'projectile' ? '#ff9b58' : '#ff668e', 12);
    playTone(source === 'projectile' ? 180 : 130, .14, 'sawtooth', .035);
    if (player.health <= 0) gameOver();
    return true;
  }

  function defeatEnemy(index) {
    const [enemy] = state.enemies.splice(index, 1);
    state.kills++;
    state.stageKills++;
    state.score += enemy.score;
    state.shards.push({
      x: enemy.x, y: enemy.y,
      xp: enemy.type === 'boss' ? 8 : enemy.type === 'brute' ? 3 : 1,
      phase: Math.random() * 7
    });
    if (enemy.type === 'boss') {
      state.pickups.push({ x: enemy.x, y: enemy.y, phase: Math.random() * 7 });
      announce(`COMMANDER DOWN — LEVEL ${state.stage} COMPLETE!`);
      playTone(720, .25, 'triangle', .045);
      completeStage();
    } else if (state.kills % 8 === 0) {
      state.pickups.push({ x: enemy.x, y: enemy.y, phase: Math.random() * 7 });
    }
    burst(enemy.x, enemy.y, enemy.color, enemy.type === 'boss' ? 32 : 10);
  }

  function shoot() {
    const p = state.player;
    let target = null;
    let distance = Infinity;
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (d < distance) { distance = d; target = enemy; }
    }
    if (!target) return;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    state.bullets.push({
      x: p.x + Math.cos(angle) * 13, y: p.y + Math.sin(angle) * 13,
      vx: Math.cos(angle) * 430, vy: Math.sin(angle) * 430,
      damage: p.damage, pierce: p.pierce, life: 1.2
    });
    playTone(540, .035, 'triangle', .018);
  }

  function burst(x, y, color, count = 7) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 100;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .25 + Math.random() * .3, maxLife: .55, color, radius: 1 + Math.random() * 2 });
    }
  }

  function levelUp() {
    const p = state.player;
    p.xp -= p.nextXp;
    p.level++;
    p.nextXp = Math.floor(p.nextXp * 1.45 + 2);
    state.mode = 'upgrade';
    ui.upgrade.classList.remove('hidden');
    const choices = [...UPGRADES].sort(() => Math.random() - .5).slice(0, 3);
    ui.options.replaceChildren();
    for (const upgrade of choices) {
      const button = document.createElement('button');
      button.className = 'upgrade-option';
      button.type = 'button';
      button.innerHTML = `<span class="upgrade-icon">${upgrade.icon}</span><span class="upgrade-name">${upgrade.name}</span><span class="upgrade-description">${upgrade.description}</span>`;
      button.addEventListener('click', () => {
        upgrade.apply(state.player);
        ui.upgrade.classList.add('hidden');
        state.mode = 'playing';
        state.last = performance.now();
        updateHud();
        playTone(760, .1, 'sine', .04);
      }, { once: true });
      ui.options.append(button);
    }
    updateHud();
  }

  function update(dt) {
    const p = state.player;
    state.elapsed += dt;
    if (!state.bossWarningShown && state.stageKills >= 9) {
      state.bossWarningShown = true;
      announce('FINAL BOSS SIGNAL DETECTED — BRACE YOURSELF!', 3, true);
    }
    if (state.stageKills >= 12 && !state.bossSpawned && state.bossSpawnTimer === null) {
      state.bossWarningShown = true;
      announce('FINAL BOSS APPROACHING — HOLD THE LINE!', 3, true);
      state.bossSpawnTimer = 3;
    }
    if (state.bossSpawnTimer !== null) {
      state.bossSpawnTimer -= dt;
      if (state.bossSpawnTimer <= 0) {
        state.bossSpawnTimer = null;
        spawnBoss();
      }
    }
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    state.toastTimer = Math.max(0, state.toastTimer - dt);
    if (state.toastTimer === 0) ui.toast.classList.remove('visible');
    const k = Math.min(1.7, 1 + (state.stage - 1) * .08 + state.elapsed / 180);
    state.spawnClock -= dt;
    if (state.bossSpawnTimer === null && state.spawnClock <= 0 && state.enemies.length < 48) {
      spawnEnemy();
      state.spawnClock = Math.max(.22, .9 / k);
    }
    let mx = (state.keys.has('ArrowRight') || state.keys.has('KeyD') ? 1 : 0) - (state.keys.has('ArrowLeft') || state.keys.has('KeyA') ? 1 : 0) + state.joystick.x;
    let my = (state.keys.has('ArrowDown') || state.keys.has('KeyS') ? 1 : 0) - (state.keys.has('ArrowUp') || state.keys.has('KeyW') ? 1 : 0) + state.joystick.y;
    if (p.dashTime > 0) {
      mx = p.dashVector.x;
      my = p.dashVector.y;
    }
    const magnitude = Math.hypot(mx, my);
    if (magnitude > 1) { mx /= magnitude; my /= magnitude; }
    const movementSpeed = p.speed * (p.dashTime > 0 ? 3.2 : 1);
    const previousX = p.x;
    const previousY = p.y;
    p.x = Math.max(p.radius + 3, Math.min(state.width - p.radius - 3, p.x + mx * movementSpeed * dt));
    p.y = Math.max(p.radius + 3, Math.min(state.height - p.radius - 3, p.y + my * movementSpeed * dt));
    p.vx = dt > 0 ? (p.x - previousX) / dt : 0;
    p.vy = dt > 0 ? (p.y - previousY) / dt : 0;
    p.invulnerable = Math.max(0, p.invulnerable - dt);

    state.fireClock -= dt;
    if (state.fireClock <= 0) { shoot(); state.fireClock = p.fireRate; }
    for (const enemy of state.enemies) {
      const dx = p.x - enemy.x, dy = p.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      if (enemy.type === 'boss' || enemy.type === 'soldier') {
        const desiredDistance = enemy.type === 'boss' ? 205 : 145;
        const direction = d > desiredDistance + 18 ? 1 : d < desiredDistance - 18 ? -1 : 0;
        enemy.x += dx / d * enemy.speed * direction * dt + -dy / d * enemy.speed * .28 * dt;
        enemy.y += dy / d * enemy.speed * direction * dt + dx / d * enemy.speed * .28 * dt;
        if (enemy.type === 'boss') {
          enemy.phase += dt;
          enemy.x += Math.sin(enemy.phase) * 13 * dt;
        }
      } else {
        enemy.x += dx / d * enemy.speed * dt;
        enemy.y += dy / d * enemy.speed * dt;
      }
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.muzzleFlash = Math.max(0, enemy.muzzleFlash - dt);
      if (enemy.type === 'boss' || enemy.type === 'soldier') {
        enemy.fireClock -= dt;
        if (enemy.fireClock <= 0) {
          fireEnemy(enemy, p);
          enemy.fireClock = enemy.type === 'boss'
            ? Math.max(.55, 1.55 - (state.stage - 1) * .1)
            : Math.max(.65, 1.9 - Math.min(state.stage - 1, 8) * .12) + Math.random() * .45;
        }
      }
      if (d < p.radius + enemy.radius && p.invulnerable <= 0) {
        if (damagePlayer(enemy.damage, 'contact')) {
          updateHud();
          if (p.health <= 0) return;
        }
      }
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
      let remove = bullet.life <= 0 || bullet.x < -15 || bullet.y < -15 || bullet.x > state.width + 15 || bullet.y > state.height + 15;
      for (let j = state.enemies.length - 1; j >= 0 && !remove; j--) {
        const enemy = state.enemies[j];
        if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < enemy.radius + 4) {
          enemy.health -= bullet.damage;
          enemy.hitFlash = .08;
          burst(bullet.x, bullet.y, enemy.color, 3);
          if (enemy.health <= 0) {
            defeatEnemy(j);
          }
          if (bullet.pierce > 0) bullet.pierce--;
          else remove = true;
        }
      }
      if (remove) state.bullets.splice(i, 1);
    }
    if (state.mode !== 'playing') { updateHud(); return; }

    for (let i = state.hostileBullets.length - 1; i >= 0; i--) {
      const bullet = state.hostileBullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      const outside = bullet.x < -20 || bullet.y < -20 || bullet.x > state.width + 20 || bullet.y > state.height + 20;
      if (bullet.life <= 0 || outside) {
        state.hostileBullets.splice(i, 1);
        continue;
      }
      if (Math.hypot(p.x - bullet.x, p.y - bullet.y) < p.radius + bullet.radius) {
        state.hostileBullets.splice(i, 1);
        if (damagePlayer(bullet.damage, 'projectile')) {
          updateHud();
          if (p.health <= 0) return;
        }
      }
    }

    for (let i = state.shards.length - 1; i >= 0; i--) {
      const shard = state.shards[i];
      const dx = p.x - shard.x, dy = p.y - shard.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < p.magnet) {
        const pull = 170 + (p.magnet - d) * 2;
        shard.x += dx / d * pull * dt; shard.y += dy / d * pull * dt;
      }
      if (d < p.radius + 8) {
        p.xp += shard.xp;
        state.shards.splice(i, 1);
        playTone(780, .055, 'sine', .025);
        if (p.xp >= p.nextXp) { levelUp(); break; }
      }
    }

    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const pickup = state.pickups[i];
      if (Math.hypot(p.x - pickup.x, p.y - pickup.y) < p.radius + 12) {
        p.health = Math.min(p.maxHealth, p.health + 25);
        state.pickups.splice(i, 1);
        burst(p.x, p.y, '#70ffad', 12);
        announce('HULL REPAIRED +25');
        playTone(880, .12, 'sine', .04);
      }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const particle = state.particles[i];
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.life -= dt; particle.vx *= .96; particle.vy *= .96;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    updateHud();
  }

  function drawBackground() {
    const w = state.width, h = state.height;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * .7);
    gradient.addColorStop(0, '#101a2c'); gradient.addColorStop(1, '#080d19');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(115,145,198,.055)'; ctx.lineWidth = 1;
    const spacing = 34;
    for (let x = 0; x <= w; x += spacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let i = 0; i < 38; i++) {
      const x = (i * 137.5) % w, y = (i * 83.7) % h;
      ctx.fillStyle = `rgba(165,190,230,${.12 + (i % 4) * .07})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function draw() {
    drawBackground();
    for (const pickup of state.pickups) {
      const pulse = 1 + Math.sin(state.elapsed * 6 + pickup.phase) * .16;
      ctx.save();
      ctx.translate(pickup.x, pickup.y);
      ctx.shadowColor = '#70ffad';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#70ffad';
      ctx.beginPath();
      ctx.arc(0, 0, 9 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#123323';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
      ctx.restore();
    }
    for (const shard of state.shards) {
      const pulse = 1 + Math.sin(state.elapsed * 5 + shard.phase) * .17;
      ctx.save(); ctx.translate(shard.x, shard.y); ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = 14; ctx.shadowColor = '#ad7cff'; ctx.fillStyle = '#bc91ff';
      ctx.fillRect(-3 * pulse, -3 * pulse, 6 * pulse, 6 * pulse); ctx.restore();
    }
    for (const bullet of state.bullets) {
      const angle = Math.atan2(bullet.vy, bullet.vx);
      ctx.save();
      ctx.translate(bullet.x, bullet.y);
      ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(95,245,226,.35)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.shadowColor = '#5ff5e2'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#d5fff9';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const bullet of state.hostileBullets) {
      const angle = Math.atan2(bullet.vy, bullet.vx);
      ctx.save();
      ctx.translate(bullet.x, bullet.y);
      ctx.rotate(angle);
      ctx.strokeStyle = `${bullet.color}66`;
      ctx.lineWidth = bullet.radius * 1.5;
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-2, 0); ctx.stroke();
      ctx.shadowColor = bullet.color; ctx.shadowBlur = 14;
      ctx.fillStyle = '#fff2dc';
      ctx.beginPath(); ctx.ellipse(0, 0, bullet.radius + 2, bullet.radius * .68, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const enemy of state.enemies) {
      const aim = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(aim);
      if (enemy.type === 'boss' && enemy.fireClock < .38) {
        ctx.strokeStyle = `rgba(255,75,117,${.22 + (1 - enemy.fireClock / .38) * .36})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.moveTo(enemy.radius, 0); ctx.lineTo(state.player.x - enemy.x, state.player.y - enemy.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      if (enemy.type === 'boss') {
        ctx.moveTo(-enemy.radius * .8, -enemy.radius * .6);
        ctx.lineTo(-enemy.radius * .45, -enemy.radius * 1.05);
        ctx.lineTo(0, -enemy.radius * .82);
        ctx.lineTo(enemy.radius * .45, -enemy.radius * 1.05);
        ctx.lineTo(enemy.radius * .8, -enemy.radius * .6);
        ctx.lineTo(enemy.radius, 0);
        ctx.lineTo(enemy.radius * .7, enemy.radius * .72);
        ctx.lineTo(0, enemy.radius);
        ctx.lineTo(-enemy.radius * .7, enemy.radius * .72);
        ctx.lineTo(-enemy.radius, 0);
        ctx.closePath();
      } else if (enemy.type === 'soldier') {
        ctx.moveTo(enemy.radius + 3, 0);
        ctx.lineTo(0, enemy.radius * .8);
        ctx.lineTo(-enemy.radius * .75, 0);
        ctx.lineTo(0, -enemy.radius * .8);
        ctx.closePath();
      } else {
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = `${enemy.color}25`;
      ctx.shadowColor = enemy.color;
      ctx.shadowBlur = enemy.type === 'boss' ? 22 : 14;
      ctx.fill();
      ctx.fillStyle = enemy.hitFlash ? '#fff' : enemy.color;
      ctx.shadowBlur = enemy.type === 'boss' ? 17 : 9;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = enemy.type === 'boss' ? '#391021' : '#151323';
      ctx.beginPath();
      ctx.arc(0, 0, enemy.type === 'boss' ? enemy.radius * .39 : enemy.radius * .32, 0, Math.PI * 2);
      ctx.fill();
      if (enemy.type === 'boss') {
        ctx.fillStyle = '#ffe6ef';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      if (enemy.type === 'soldier' && enemy.muzzleFlash > 0) {
        ctx.fillStyle = '#fff0bd';
        ctx.shadowColor = '#ffae59'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(enemy.radius + 5, 0, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (enemy.type === 'boss') {
        const barWidth = enemy.radius * 2.5;
        ctx.fillStyle = 'rgba(8,10,19,.85)';
        ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 12, barWidth, 4);
        ctx.fillStyle = '#ff6287';
        ctx.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 12, barWidth * Math.max(0, enemy.health / enemy.maxHealth), 4);
      }
    }
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = particle.color; ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (state.player) {
      const p = state.player;
      const target = state.enemies.reduce((nearest, e) => !nearest || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(nearest.x - p.x, nearest.y - p.y) ? e : nearest, null);
      const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : -Math.PI / 2;
      if (p.dashTime > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(95,245,226,.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (p.invulnerable <= 0 || Math.floor(state.elapsed * 16) % 2 === 0) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle + Math.PI / 2);
        ctx.shadowColor = '#5ff5e2'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 9); ctx.lineTo(0, 5); ctx.lineTo(-9, 9); ctx.closePath();
        ctx.fillStyle = '#81ffeb'; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fillStyle = '#132d38'; ctx.fill();
        ctx.restore();
      }
    }
    if (state.mode === 'start') {
      ctx.fillStyle = 'rgba(95,245,226,.045)';
      ctx.beginPath(); ctx.arc(state.width / 2, state.height / 2, 42, 0, Math.PI * 2); ctx.fill();
    }
  }

  function frame(now) {
    const dt = Math.min(.035, (now - state.last) / 1000 || 0);
    state.last = now;
    if (state.mode === 'playing') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function playTone(frequency, duration, type = 'sine', volume = .02) {
    if (!state.sound) return;
    try {
      if (!state.audio) state.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (state.audio.state === 'suspended') state.audio.resume();
      const oscillator = state.audio.createOscillator();
      const gain = state.audio.createGain();
      oscillator.type = type; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, state.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, state.audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(state.audio.destination);
      oscillator.start(); oscillator.stop(state.audio.currentTime + duration);
    } catch (error) {
      console.warn('Audio playback is unavailable.', error);
      state.sound = false;
      $('sound-button').classList.add('muted');
    }
  }

  $('start-button').addEventListener('click', startGame);
  $('restart-button').addEventListener('click', startGame);
  ui.nextStage.addEventListener('click', startNextStage);
  $('resume-button').addEventListener('click', pauseGame);
  $('pause-button').addEventListener('click', pauseGame);
  $('arena-pause').addEventListener('click', pauseGame);
  ui.accountButton.addEventListener('click', openAccountPanel);
  $('leaderboard-button').addEventListener('click', openAccountPanel);
  $('account-close').addEventListener('click', closeAccountPanel);
  ui.accountOverlay.addEventListener('click', (event) => {
    if (event.target === ui.accountOverlay) closeAccountPanel();
  });
  ui.signinTab.addEventListener('click', () => setAccountMode('signin'));
  ui.signupTab.addEventListener('click', () => setAccountMode('signup'));
  ui.accountForm.addEventListener('submit', submitAccount);
  $('signout-button').addEventListener('click', signOut);
  ui.dash.addEventListener('pointerdown', (event) => event.preventDefault());
  ui.dash.addEventListener('click', dash);
  $('sound-button').addEventListener('click', () => {
    state.sound = !state.sound;
    $('sound-button').classList.toggle('muted', !state.sound);
    $('sound-button').setAttribute('aria-label', state.sound ? 'Toggle sound' : 'Turn sound on');
    if (state.sound) playTone(600, .06);
  });

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Escape' && !ui.accountOverlay.classList.contains('hidden')) {
      closeAccountPanel();
      return;
    }
    if (event.code === 'Escape') { pauseGame(); return; }
    if (event.code === 'Enter' && !event.repeat && state.mode === 'levelcomplete') { startNextStage(); return; }
    if ((event.code === 'Enter' || event.code === 'Space') && (state.mode === 'start' || state.mode === 'gameover')) { startGame(); return; }
    if (event.code === 'Space' && !event.repeat) { dash(); return; }
    state.keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => state.keys.delete(event.code));
  window.addEventListener('blur', () => { state.keys.clear(); state.joystick.x = 0; state.joystick.y = 0; ui.knob.style.transform = ''; });

  const joystick = $('joystick');
  let pointerId = null;
  function updateJoystick(event) {
    const rect = joystick.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const limit = rect.width * .34;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, limit / length);
    state.joystick.x = dx / length * scale;
    state.joystick.y = dy / length * scale;
    ui.knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }
  joystick.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'playing') return;
    pointerId = event.pointerId;
    updateJoystick(event);
  });
  window.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) updateJoystick(event); });
  function releaseJoystick(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null; state.joystick.x = 0; state.joystick.y = 0; ui.knob.style.transform = '';
  }
  window.addEventListener('pointerup', releaseJoystick);
  window.addEventListener('pointercancel', releaseJoystick);

  $('best-value').textContent = String(state.best).padStart(6, '0');
  restoreAccountSession();
  updateAccountUI();
  resize();
  requestAnimationFrame((now) => { state.last = now; frame(now); });
})();
