/* ═══════════════════════════════════════════════
   Minesweeper — Game Logic + Animations
   ═══════════════════════════════════════════════ */

// ─── Constants ────────────────────────────────────
const DIFFICULTIES = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, label: '初级' },
  intermediate: { rows: 16, cols: 16, mines: 40, label: '中级' },
  expert:       { rows: 16, cols: 30, mines: 99, label: '专家' },
};

const STATE = { WAITING: 0, PLAYING: 1, WON: 2, LOST: 3 };
const COLORS = ['#ff4444', '#ff8800', '#ffdd00', '#44cc44', '#44cccc', '#4488ff', '#8844ff', '#ff44cc'];

// ─── DOM refs ──────────────────────────────────────
const $ = (s, p = document) => (typeof s === 'string' ? p.querySelector(s) : s);
const $$ = (s, p = document) => p.querySelectorAll(s);

const boardEl = $('#board');
const boardWrapper = $('#board-wrapper');
const gamePanel = $('#game-panel');
const mineCounterEl = $('#mine-counter .counter-value');
const timerEl = $('#timer .counter-value');
const resetBtn = $('#reset-btn');
const diffBtns = $$('.diff-btn');
const modalOverlay = $('#modal-overlay');
const modalIcon = $('#modal-icon');
const modalTitle = $('#modal-title');
const modalStats = $('#modal-stats');
const modalDetail = $('#modal-detail');
const modalBtn = $('#modal-btn');

// ─── Game state ────────────────────────────────────
let difficulty = 'beginner';
let rows, cols, mineCount;
let grid = [];
let state = STATE.WAITING;
let flagCount = 0;
let revealedCount = 0;
let timerInterval = null;
let seconds = 0;
let isFirstClick = true;
let isRevealing = false; // prevent clicks during animation

// ─── Cell factory ──────────────────────────────────
const createCell = (r, c) => ({ r, c, mine: false, revealed: false, flagged: false, adjacentMines: 0 });

// ─── Neighbour iteration ──────────────────────────
function forEachNeighbor(r, c, fn) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) fn(nr, nc);
    }
  }
}

// ─── Grid init ─────────────────────────────────────
function initGrid() {
  grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => createCell(r, c))
  );
}

// ─── Mine placement (first-click safe) ────────────
function placeMines(safeR, safeC) {
  const safe = new Set();
  forEachNeighbor(safeR, safeC, (nr, nc) => safe.add(nr * cols + nc));
  safe.add(safeR * cols + safeC);

  let placed = 0;
  while (placed < mineCount) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!grid[r][c].mine && !safe.has(r * cols + c)) {
      grid[r][c].mine = true;
      placed++;
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].mine) continue;
      let count = 0;
      forEachNeighbor(r, c, (nr, nc) => { if (grid[nr][nc].mine) count++; });
      grid[r][c].adjacentMines = count;
    }
  }
}

// ═══════════════════════════════════════════════════
//   BFS Cascade Reveal
// ═══════════════════════════════════════════════════

function revealCascade(startR, startC) {
  if (grid[startR][startC].revealed || grid[startR][startC].flagged) return [];
  if (grid[startR][startC].mine) return []; // handled separately

  const revealed = [];
  const queue = [{ r: startR, c: startC, dist: 0 }];
  const visited = new Set();
  visited.add(startR * cols + startC);

  while (queue.length) {
    const { r, c, dist } = queue.shift();
    const cell = grid[r][c];
    if (cell.revealed || cell.flagged) continue;

    cell.revealed = true;
    revealedCount++;
    revealed.push({ r, c, dist });

    if (cell.adjacentMines === 0) {
      forEachNeighbor(r, c, (nr, nc) => {
        const key = nr * cols + nc;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ r: nr, c: nc, dist: dist + 1 });
        }
      });
    }
  }

  return revealed;
}

// ═══════════════════════════════════════════════════
//   Render
// ═══════════════════════════════════════════════════

function render({ newlyRevealed = [], animateEntrance = false, animateMines = false } = {}) {
  // Build lookup for animated cells
  const animMap = new Map();
  newlyRevealed.forEach(({ r, c, dist }) => animMap.set(`${r},${c}`, dist));

  boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // Board entrance animation
  if (animateEntrance) {
    boardEl.classList.remove('board-entrance');
    void boardEl.offsetWidth; // force reflow
    boardEl.classList.add('board-entrance');
  } else {
    boardEl.classList.remove('board-entrance');
  }

  // Track newly flagged for animation
  const flagEls = [];

  boardEl.innerHTML = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.r = r;
      div.dataset.c = c;

      const key = `${r},${c}`;
      const hasAnimDelay = animMap.has(key);
      const delay = animMap.get(key) ?? 0;

      // ── State: LOST ──
      if (state === STATE.LOST) {
        if (cell.revealed && cell.mine) {
          // The clicked mine — explosion effect
          div.classList.add('cell-mine');
        } else if (cell.flagged && cell.mine) {
          // Correctly flagged mine — keep the flag
          div.classList.add('cell-flagged');
        } else if (cell.flagged && !cell.mine) {
          // Wrong flag — mark with ✕
          div.classList.add('cell-revealed', 'cell-wrong-flag');
          div.textContent = '✕';
          div.style.fontSize = '14px';
          div.style.color = '#ff4444';
        } else if (cell.mine) {
          // Unrevealed mine — show with staggered animation
          div.classList.add('cell-mine-revealed');
          if (animateMines) {
            const d = Math.min(Math.abs(r - 0) + Math.abs(c - 0), 15);
            div.style.setProperty('--delay', d);
          }
        } else if (cell.revealed) {
          div.classList.add('cell-revealed');
          if (cell.adjacentMines > 0) {
            div.textContent = cell.adjacentMines;
            div.classList.add(`cell-num-${cell.adjacentMines}`);
          }
        } else {
          div.classList.add('cell-hidden');
        }

        addListeners(div, r, c);
        boardEl.appendChild(div);
        continue;
      }

      // ── State: WON ──
      if (state === STATE.WON) {
        const h = animMap.has(key);
        const d = animMap.get(key) ?? 0;
        if (cell.mine) {
          div.classList.add('cell-flagged');
        } else {
          div.classList.add('cell-revealed');
          if (cell.adjacentMines > 0) {
            div.textContent = cell.adjacentMines;
            div.classList.add(`cell-num-${cell.adjacentMines}`);
            if (h) { div.style.setProperty('--delay', d); div.classList.add('cell-num-pop'); }
          } else if (h) {
            div.style.setProperty('--delay', d);
            div.classList.add('cell-appear');
          }
        }
        addListeners(div, r, c);
        boardEl.appendChild(div);
        continue;
      }

      // ── Normal states (WAITING / PLAYING) ──
      if (cell.revealed) {
        div.classList.add('cell-revealed');
        if (cell.adjacentMines > 0) {
          div.textContent = cell.adjacentMines;
          div.classList.add(`cell-num-${cell.adjacentMines}`);
        }
        if (hasAnimDelay) {
          div.style.setProperty('--delay', delay);
          if (cell.adjacentMines > 0) {
            div.classList.add('cell-num-pop');
          } else {
            div.classList.add('cell-appear');
          }
        }
      } else if (cell.flagged) {
        div.classList.add('cell-flagged');
        if (hasAnimDelay) {
          // Flag just placed — animation handled by CSS
        }
      } else {
        div.classList.add('cell-hidden');
      }

      addListeners(div, r, c);
      boardEl.appendChild(div);

      if (cell.flagged && hasAnimDelay) {
        flagEls.push(div);
      }
    }
  }
}

// ─── Event binding ──────────────────────────────
function addListeners(el, r, c) {
  el.addEventListener('click', () => onLeftClick(r, c));
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); onRightClick(r, c); });

  // Mobile: long press for flag
  let t = null;
  el.addEventListener('touchstart', (e) => {
    t = setTimeout(() => { e.preventDefault(); onRightClick(r, c); }, 400);
  });
  el.addEventListener('touchend', () => clearTimeout(t));
  el.addEventListener('touchmove', () => clearTimeout(t));
}

// ═══════════════════════════════════════════════════
//   Click Handlers
// ═══════════════════════════════════════════════════

function onLeftClick(r, c) {
  if (isRevealing || state === STATE.WON || state === STATE.LOST) return;
  const cell = grid[r][c];
  if (cell.flagged || cell.revealed) return;

  if (isFirstClick) {
    placeMines(r, c);
    isFirstClick = false;
    state = STATE.PLAYING;
    startTimer();
  }

  if (cell.mine) {
    cell.revealed = true;
    endGame(false);
    return;
  }

  const newlyRevealed = revealCascade(r, c);
  if (checkWin()) {
    endGame(true, newlyRevealed);
    return;
  }

  render({ newlyRevealed });
}

function onRightClick(r, c) {
  if (state === STATE.WON || state === STATE.LOST) return;
  if (state === STATE.WAITING) return;
  const cell = grid[r][c];
  if (cell.revealed) return;

  cell.flagged = !cell.flagged;
  flagCount += cell.flagged ? 1 : -1;

  // Animate the flag
  render({ newlyRevealed: [{ r, c, dist: 0 }] });
  updateMineCounter();
}

// ═══════════════════════════════════════════════════
//   Game End
// ═══════════════════════════════════════════════════

function endGame(won, newlyRevealed = []) {
  state = won ? STATE.WON : STATE.LOST;
  clearInterval(timerInterval);

  if (won) {
    // Auto-flag remaining mines
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c].mine && !grid[r][c].flagged) {
          grid[r][c].flagged = true;
        }
      }
    }
    flagCount = mineCount;
    updateMineCounter();

    // Render with cascade animation for the final reveals
    render({ newlyRevealed });

    gamePanel.classList.add('win-glow');
    resetBtn.textContent = '😎';

    // Confetti!
    setTimeout(createConfetti, 300);
  } else {
    // Shake the board
    boardWrapper.classList.remove('shake');
    void boardWrapper.offsetWidth;
    boardWrapper.classList.add('shake');

    render({ animateMines: true });

    // Flash explosion on reset button
    resetBtn.textContent = '💥';
    setTimeout(() => { resetBtn.textContent = '😵'; }, 600);
  }

  // Show result modal
  const delay = won ? 600 : 500;
  setTimeout(() => {
    modalIcon.textContent = won ? '🎉' : '💥';
    modalTitle.textContent = won ? '恭喜通关！' : '踩雷了！';
    modalTitle.style.color = won ? '#64c8ff' : '#ff4444';
    const cfg = DIFFICULTIES[difficulty];
    modalStats.textContent = won
      ? `${cfg.label} · ${cfg.rows}×${cfg.cols} · ${cfg.mines}雷`
      : `${cfg.label} · ${cfg.rows}×${cfg.cols} · ${cfg.mines}雷`;
    modalDetail.textContent = `用时 ${seconds} 秒`;
    modalOverlay.classList.add('show');
  }, delay);
}

function checkWin() {
  return revealedCount === rows * cols - mineCount;
}

// ═══════════════════════════════════════════════════
//   Counters & Timer
// ═══════════════════════════════════════════════════

function updateMineCounter() {
  const remaining = Math.max(mineCount - flagCount, 0);
  const val = String(remaining).padStart(3, '0');
  if (mineCounterEl.textContent !== val) {
    mineCounterEl.textContent = val;
    mineCounterEl.classList.remove('pulse');
    void mineCounterEl.offsetWidth;
    mineCounterEl.classList.add('pulse');
  }
}

function updateTimer() {
  const val = String(seconds).padStart(3, '0');
  if (timerEl.textContent !== val) {
    timerEl.textContent = val;
  }
}

function startTimer() {
  seconds = 0;
  updateTimer();
  timerInterval = setInterval(() => {
    seconds++;
    updateTimer();
    // Timer tick animation: subtle pulse every 5s
    if (seconds % 5 === 0) {
      timerEl.classList.remove('pulse');
      void timerEl.offsetWidth;
      timerEl.classList.add('pulse');
    }
  }, 1000);
}

// ═══════════════════════════════════════════════════
//   Confetti 🎊
// ═══════════════════════════════════════════════════

function createConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';

  const shapes = ['square', 'circle'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const isCircle = shapes[i % 2] === 'circle';
    const size = 4 + Math.random() * 8;
    piece.style.cssText = [
      `left: ${Math.random() * 100}%`,
      `background: ${COLORS[i % COLORS.length]}`,
      `width: ${isCircle ? size : size * 0.6}px`,
      `height: ${size}px`,
      `border-radius: ${isCircle ? '50%' : '2px'}`,
      `animation-delay: ${Math.random() * 1.5}s`,
      `animation-duration: ${2 + Math.random() * 2}s`,
      `transform: rotate(${Math.random() * 360}deg)`,
      `opacity: ${0.7 + Math.random() * 0.3}`,
    ].join(';');
    container.appendChild(piece);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 5000);
}

// ═══════════════════════════════════════════════════
//   New Game / Reset
// ═══════════════════════════════════════════════════

function newGame() {
  clearInterval(timerInterval);
  modalOverlay.classList.remove('show');
  isFirstClick = true;
  state = STATE.WAITING;
  flagCount = 0;
  revealedCount = 0;
  seconds = 0;
  isRevealing = false;

  // Spinning reset button
  resetBtn.classList.remove('spin');
  void resetBtn.offsetWidth;
  resetBtn.classList.add('spin');
  setTimeout(() => {
    resetBtn.textContent = '😊';
    resetBtn.classList.remove('spin');
  }, 300);

  gamePanel.classList.remove('win-glow');
  boardWrapper.classList.remove('shake');

  const cfg = DIFFICULTIES[difficulty];
  rows = cfg.rows;
  cols = cfg.cols;
  mineCount = cfg.mines;
  diffLabel = cfg.label;

  initGrid();
  updateMineCounter();
  updateTimer();

  render({ animateEntrance: true });
}

// ─── Difficulty ──────────────────────────────────
function setDifficulty(diff) {
  if (diff === difficulty) return;
  difficulty = diff;
  diffBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
  newGame();
}

// ═══════════════════════════════════════════════════
//   Ripple Effect
// ═══════════════════════════════════════════════════

function createRipple(e, el) {
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = (e.clientX || e.touches?.[0]?.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
  const y = (e.clientY || e.touches?.[0]?.clientY || rect.top + rect.height / 2) - rect.top - size / 2;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

// ─── Event Binding ────────────────────────────────
diffBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    createRipple(e, btn);
    setDifficulty(btn.dataset.diff);
  });
});

resetBtn.addEventListener('click', (e) => {
  createRipple(e, resetBtn);
  newGame();
});

modalBtn.addEventListener('click', (e) => {
  createRipple(e, modalBtn);
  newGame();
});

// Prevent context menu on board
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.board')) e.preventDefault();
});

// ─── Keyboard shortcuts ─────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') { newGame(); e.preventDefault(); }
  if (e.key === '1') setDifficulty('beginner');
  if (e.key === '2') setDifficulty('intermediate');
  if (e.key === '3') setDifficulty('expert');
});

// ═══════════════════════════════════════════════════
//   Start
// ═══════════════════════════════════════════════════

newGame();
