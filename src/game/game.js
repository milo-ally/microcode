const GRID_SIZE = 20;
const CELL_SIZE = 20;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const MOVE_INTERVAL = 150;

const DIR = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const OPPOSITE = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

export default class SnakeGame {
  constructor(canvasId, scoreDisplayId, restartBtnId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;

    this.scoreDisplay = document.getElementById(scoreDisplayId);
    this.restartBtn = document.getElementById(restartBtnId);

    this.restartBtn.addEventListener('click', () => this.restart());

    this.state = this.initState();
    this.lastMove = 0;
    this.raf = null;

    this.handleKey = (e) => this.onKey(e);
    document.addEventListener('keydown', this.handleKey);

    this.loop = (timestamp) => this.tick(timestamp);
    this.raf = requestAnimationFrame(this.loop);
  }

  initState() {
    const center = Math.floor(GRID_SIZE / 2);
    return {
      snake: [
        { x: center, y: center },
        { x: center - 1, y: center },
        { x: center - 2, y: center },
      ],
      dir: 'RIGHT',
      nextDir: 'RIGHT',
      food: this.randomFood([]),
      ghostFood: this.randomFood([]),
      ghostMode: false,
      ghostTimer: 0,
      score: 0,
      speed: 150,
      gameOver: false,
      wrapMode: false,
    };
  }

  randomFood(snake) {
    const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
    const free = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  onKey(e) {
    if (e.key === 'W' || e.key === 'w') {
      e.preventDefault();
      this.state.wrapMode = !this.state.wrapMode;
      if (this.state.wrapMode) {
        this.canvas.style.borderColor = '#0ff';
      } else {
        this.canvas.style.borderColor = '#333';
      }
      return;
    }

    const keyMap = {
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
    };
    const dir = keyMap[e.key];
    if (!dir) return;
    e.preventDefault();
    if (dir !== OPPOSITE[this.state.dir]) {
      this.state.nextDir = dir;
    }
  }

  tick(timestamp) {
    if (this.state.gameOver) {
      this.draw();
      return;
    }

    if (timestamp - this.lastMove >= this.state.speed) {
      this.lastMove = timestamp;
      this.state.dir = this.state.nextDir;
      this.move();
    }

    // Decrement ghost timer by delta time (approximate with frame time)
    if (this.state.ghostMode) {
      this.state.ghostTimer -= 1 / 60;
      if (this.state.ghostTimer <= 0) {
        this.state.ghostMode = false;
        this.state.ghostTimer = 0;
      }
    }

    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }

  move() {
    const s = this.state;
    const head = s.snake[0];
    const d = DIR[s.dir];
    const newHead = { x: head.x + d.x, y: head.y + d.y };

    // Wall collision
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
      if (s.wrapMode) {
        newHead.x = (newHead.x + GRID_SIZE) % GRID_SIZE;
        newHead.y = (newHead.y + GRID_SIZE) % GRID_SIZE;
      } else {
        s.gameOver = true;
        return;
      }
    }

    // Self collision (skip tail if no food eaten — it will move away)
    const willEat = s.food && newHead.x === s.food.x && newHead.y === s.food.y;
    const willEatGhost = s.ghostFood && newHead.x === s.ghostFood.x && newHead.y === s.ghostFood.y;
    const bodyToCheck = (willEat || willEatGhost) ? s.snake : s.snake.slice(0, -1);
    if (!s.ghostMode && bodyToCheck.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
      s.gameOver = true;
      return;
    }

    s.snake.unshift(newHead);

    if (willEat) {
      s.score++;
      this.updateScore();
      s.speed = Math.max(50, s.speed - 10);
      s.food = this.randomFood(s.snake);
    } else if (willEatGhost) {
      s.ghostMode = true;
      s.ghostTimer = 5;
      s.ghostFood = this.randomFood(s.snake);
    } else {
      s.snake.pop();
    }
  }

  updateScore() {
    this.scoreDisplay.textContent = `Score: ${this.state.score}`;
    this.scoreDisplay.dispatchEvent(new CustomEvent('scoreChanged'));
  }

  draw() {
    const ctx = this.ctx;

    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid lines
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }

    // Snake
    this.state.snake.forEach((seg, i) => {
      if (this.state.ghostMode) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
      } else {
        ctx.fillStyle = i === 0 ? '#4f4' : '#2a2';
      }
      ctx.fillRect(seg.x * CELL_SIZE + 1, seg.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    });

    // Eyes on head
    const head = this.state.snake[0];
    const hx = head.x * CELL_SIZE;
    const hy = head.y * CELL_SIZE;
    const dir = this.state.dir;
    const eyeOffsets = {
      RIGHT: [{ x: 13, y: 4 }, { x: 13, y: 12 }],
      LEFT: [{ x: 3, y: 4 }, { x: 3, y: 12 }],
      UP: [{ x: 4, y: 3 }, { x: 12, y: 3 }],
      DOWN: [{ x: 4, y: 13 }, { x: 12, y: 13 }],
    };
    for (const offset of eyeOffsets[dir]) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(hx + offset.x, hy + offset.y, 4, 4);
      ctx.fillStyle = '#111';
      ctx.fillRect(hx + offset.x + 1, hy + offset.y + 1, 2, 2);
    }

    // Food
    if (this.state.food) {
      ctx.fillStyle = '#f44';
      ctx.fillRect(
        this.state.food.x * CELL_SIZE + 2,
        this.state.food.y * CELL_SIZE + 2,
        CELL_SIZE - 4,
        CELL_SIZE - 4
      );
    }

    // Ghost food (gold diamond)
    if (this.state.ghostFood) {
      const gx = this.state.ghostFood.x * CELL_SIZE + CELL_SIZE / 2;
      const gy = this.state.ghostFood.y * CELL_SIZE + CELL_SIZE / 2;
      const r = CELL_SIZE / 2 - 3;
      ctx.fillStyle = '#ff0';
      ctx.beginPath();
      ctx.moveTo(gx, gy - r);
      ctx.lineTo(gx + r, gy);
      ctx.lineTo(gx, gy + r);
      ctx.lineTo(gx - r, gy);
      ctx.closePath();
      ctx.fill();
    }

    // Game over overlay
    if (this.state.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GAME OVER', CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 16);
      ctx.font = '18px monospace';
      ctx.fillText(`Score: ${this.state.score}`, CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 20);
    } else {
      // Draw score on canvas
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Score: ${this.state.score}`, 6, 6);

      if (this.state.wrapMode) {
        ctx.fillStyle = 'rgba(0,255,255,0.6)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('WRAP', CANVAS_SIZE - 6, 6);
      }

      if (this.state.ghostMode) {
        ctx.fillStyle = 'rgba(255,255,0,0.8)';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`GHOST: ${this.state.ghostTimer.toFixed(1)}s`, CANVAS_SIZE / 2, 6);
      }
    }
  }

  restart() {
    this.state = this.initState();
    this.lastMove = 0;
  }
}
