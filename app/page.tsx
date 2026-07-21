"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type MinoId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
type Board = { cells: Uint8Array; paths: number; last: MinoId | null; height: number };
type Pair = [MinoId, MinoId];

const W = 10;
const H = 20;
const IDS: MinoId[] = ["I", "O", "T", "S", "Z", "J", "L"];
const CELL_IDS: (MinoId | null)[] = [null, ...IDS];
const CELL_CODE: Record<MinoId, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
const COLORS: Record<MinoId, string> = {
  I: "#20d9ee", O: "#f5d547", T: "#aa6df2", S: "#57d17b",
  Z: "#f05b68", J: "#4f7df3", L: "#f59c45",
};
const RGB: Record<MinoId, [number, number, number]> = {
  I: [32, 217, 238], O: [245, 213, 71], T: [170, 109, 242],
  S: [87, 209, 123], Z: [240, 91, 104], J: [79, 125, 243], L: [245, 156, 69],
};
const SHAPES: Record<MinoId, number[][]> = {
  I: [[0,1],[1,1],[2,1],[3,1]], O: [[1,0],[2,0],[1,1],[2,1]],
  T: [[1,0],[0,1],[1,1],[2,1]], S: [[1,0],[2,0],[0,1],[1,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]], J: [[0,0],[0,1],[1,1],[2,1]],
  L: [[2,0],[0,1],[1,1],[2,1]],
};

function emptyBoard(): Board {
  return { cells: new Uint8Array(W * H), paths: 1, last: null, height: 0 };
}

function rotatePoint([x, y]: number[], turns: number, id: MinoId) {
  if (id === "O") return [x, y];
  const edge = id === "I" ? 3 : 2;
  let px = x; let py = y;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [px, py] = [edge - py, px];
  return [px, py];
}

function points(id: MinoId, rotation: number) {
  return SHAPES[id].map((p) => rotatePoint(p, rotation, id));
}

function valid(board: Board, id: MinoId, x: number, y: number, rotation: number) {
  return points(id, rotation).every(([dx, dy]) => {
    const bx = x + dx; const by = y + dy;
    return bx >= 0 && bx < W && by < H && (by < 0 || !board.cells[by * W + bx]);
  });
}

function landingY(board: Board, id: MinoId, x: number, y: number, rotation: number) {
  if (!valid(board, id, x, y, rotation)) return null;
  let finalY = y;
  while (valid(board, id, x, finalY + 1, rotation)) finalY++;
  return finalY;
}

function allPairs() {
  const result: Pair[] = [];
  IDS.forEach((a, i) => IDS.slice(i + 1).forEach((b) => result.push([a, b])));
  return result;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mixedColor([a, b]: Pair, alpha = 1) {
  const rgb = RGB[a].map((v, i) => Math.round((v + RGB[b][i]) / 2));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function worldCount(boards: Board[]) { return boards.reduce((sum, b) => sum + b.paths, 0); }

function heightOf(board: Board) {
  return board.height;
}

function MiniShape({ id }: { id: MinoId }) {
  return <div className="mini-shape" aria-label={`${id}ミノ`}>
    {Array.from({ length: 16 }, (_, index) => {
      const x = index % 4; const y = Math.floor(index / 4);
      const on = SHAPES[id].some(([px, py]) => px === x && py === y);
      return <i key={index} style={on ? { background: COLORS[id], boxShadow: `0 0 10px ${COLORS[id]}66` } : undefined} />;
    })}
  </div>;
}

function BoardCanvas({ board, pair, x, y, rotation, paused }: {
  board: Board; pair: Pair; x: number; y: number; rotation: number; paused: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ratio = window.devicePixelRatio || 1; const cssW = 300; const cssH = 600;
    canvas.width = cssW * ratio; canvas.height = cssH * ratio;
    const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(ratio, ratio);
    const cell = 30;
    ctx.fillStyle = "#080b17"; ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "rgba(127,146,190,.09)"; ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx++) { ctx.beginPath(); ctx.moveTo(gx*cell,0); ctx.lineTo(gx*cell,cssH); ctx.stroke(); }
    for (let gy = 0; gy <= H; gy++) { ctx.beginPath(); ctx.moveTo(0,gy*cell); ctx.lineTo(cssW,gy*cell); ctx.stroke(); }
    board.cells.forEach((code, index) => {
      if (!code) return; const id = CELL_IDS[code]!; const color = COLORS[id];
      const by = Math.floor(index / W); const bx = index % W;
      ctx.fillStyle = color; ctx.fillRect(bx*cell+2,by*cell+2,cell-4,cell-4);
      ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.fillRect(bx*cell+4,by*cell+4,cell-8,3);
    });
    pair.forEach((id, idx) => {
      const ghostY = landingY(board, id, x, y, rotation);
      if (ghostY !== null) {
        ctx.strokeStyle = COLORS[id] + "88"; ctx.lineWidth = 2;
        points(id, rotation).forEach(([dx,dy]) => ctx.strokeRect((x+dx)*cell+4,(ghostY+dy)*cell+4,cell-8,cell-8));
      }
      ctx.fillStyle = mixedColor(pair, idx === 0 ? .72 : .5);
      points(id, rotation).forEach(([dx,dy]) => {
        const by = y+dy; if (by >= 0) ctx.fillRect((x+dx)*cell+2,by*cell+2,cell-4,cell-4);
      });
    });
    if (paused) { ctx.fillStyle = "rgba(3,5,12,.72)"; ctx.fillRect(0,0,cssW,cssH); }
  }, [board, pair, x, y, rotation, paused]);
  return <canvas className="focus-canvas" ref={ref} aria-label="選択中の候補盤面" />;
}

function SuperpositionCanvas({ boards, pair, x, y, rotation, paused }: {
  boards: Board[]; pair: Pair; x: number; y: number; rotation: number; paused: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ratio = window.devicePixelRatio || 1; const cssW = 300; const cssH = 600; const cell = 30;
    canvas.width = cssW * ratio; canvas.height = cssH * ratio;
    const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(ratio, ratio);
    ctx.fillStyle = "#080b17"; ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "rgba(127,146,190,.09)"; ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx++) { ctx.beginPath(); ctx.moveTo(gx*cell,0); ctx.lineTo(gx*cell,cssH); ctx.stroke(); }
    for (let gy = 0; gy <= H; gy++) { ctx.beginPath(); ctx.moveTo(0,gy*cell); ctx.lineTo(cssW,gy*cell); ctx.stroke(); }
    const total = Math.max(1, worldCount(boards));
    for (let by = 0; by < H; by++) for (let bx = 0; bx < W; bx++) {
      const weights: Partial<Record<MinoId, number>> = {}; let occupied = 0;
      boards.forEach((board) => {
        const code = board.cells[by * W + bx]; if (!code) return;
        const id = CELL_IDS[code]!; occupied += board.paths; weights[id] = (weights[id] ?? 0) + board.paths;
      });
      if (!occupied) continue;
      const color = IDS.reduce((best, id) => (weights[id] ?? 0) > (weights[best] ?? 0) ? id : best, IDS[0]);
      const density = occupied / total;
      ctx.globalAlpha = .16 + density * .72; ctx.fillStyle = COLORS[color];
      ctx.fillRect(bx*cell+2,by*cell+2,cell-4,cell-4);
      ctx.globalAlpha = .24 + density * .5; ctx.strokeStyle = "#effcff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx*cell+3,by*cell+cell-5); ctx.lineTo(bx*cell+cell-5,by*cell+3); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    pair.forEach((id, index) => {
      ctx.fillStyle = mixedColor(pair, index === 0 ? .72 : .48);
      points(id, rotation).forEach(([dx,dy]) => {
        const by = y+dy; if (by >= 0) ctx.fillRect((x+dx)*cell+2,by*cell+2,cell-4,cell-4);
      });
    });
    if (paused) { ctx.fillStyle = "rgba(3,5,12,.72)"; ctx.fillRect(0,0,cssW,cssH); }
  }, [boards, pair, paused, rotation, x, y]);
  return <canvas className="focus-canvas aggregate-canvas" ref={ref} aria-label="すべての候補盤面を重ねた未観測表示" />;
}

function UniverseCanvas({ boards, selected, onSelect }: { boards: Board[]; selected: number; onSelect: (n: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null); const layoutRef = useRef({ cols: 1, tileW: 1, tileH: 1 });
  useEffect(() => {
    const canvas = ref.current; const host = wrap.current; if (!canvas || !host) return;
    const draw = () => {
      const rect = host.getBoundingClientRect(); const width = Math.max(260, Math.floor(rect.width));
      const n = boards.length; const detailed = n <= 16;
      const aspect = detailed ? .58 : .62; const gap = n > 1000 ? 1 : n > 100 ? 3 : 8;
      const minTile = n > 1000 ? 4 : 14;
      const idealCols = Math.max(1, Math.ceil(Math.sqrt(n * width / Math.max(280, rect.height || 500) / aspect)));
      const maxCols = Math.max(1, Math.floor((width + gap) / (minTile + gap)));
      const cols = Math.min(idealCols, maxCols);
      const tileW = Math.max(minTile, Math.floor((width - gap * (cols - 1)) / cols));
      const tileH = Math.max(7, Math.round(tileW * 1.72));
      const rows = Math.ceil(n / cols); const height = Math.max(310, rows * (tileH + gap));
      const fastRaster = n > 1500; const ratio = fastRaster ? 1 : window.devicePixelRatio || 1;
      canvas.width = width * ratio; canvas.height = height * ratio; canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      layoutRef.current = { cols, tileW: tileW + gap, tileH: tileH + gap };
      if (fastRaster) {
        const image = ctx.createImageData(width, height); const pixels = image.data;
        const setPixel = (px: number, py: number, r: number, g: number, b: number, a = 255) => {
          if (px < 0 || py < 0 || px >= width || py >= height) return;
          const p = (py * width + px) * 4; pixels[p] = r; pixels[p+1] = g; pixels[p+2] = b; pixels[p+3] = a;
        };
        boards.forEach((board, index) => {
          const ox = (index % cols) * (tileW + gap); const oy = Math.floor(index / cols) * (tileH + gap);
          for (let py = 0; py < tileH; py++) for (let px = 0; px < tileW; px++) setPixel(ox+px,oy+py,8,11,22,255);
          board.cells.forEach((code, cellIndex) => {
            if (!code) return; const id = CELL_IDS[code]!; const [r,g,b] = RGB[id];
            const bx = cellIndex % W; const by = Math.floor(cellIndex / W);
            const px = ox + Math.min(tileW-1, Math.floor((bx+.5) * tileW / W));
            const py = oy + Math.min(tileH-1, Math.floor((by+.5) * tileH / H));
            const p = (py * width + px) * 4;
            if (pixels[p+3] && (pixels[p] !== 8 || pixels[p+1] !== 11 || pixels[p+2] !== 22)) {
              setPixel(px,py,Math.round((pixels[p]+r)/2),Math.round((pixels[p+1]+g)/2),Math.round((pixels[p+2]+b)/2));
            } else setPixel(px,py,r,g,b);
          });
          const selectedFrame = index === selected;
          const frame: [number,number,number] = selectedFrame ? [232,253,255] : [41,217,255];
          for (let px = 0; px < tileW; px++) { setPixel(ox+px,oy,...frame); setPixel(ox+px,oy+tileH-1,...frame); }
          for (let py = 0; py < tileH; py++) { setPixel(ox,oy+py,...frame); setPixel(ox+tileW-1,oy+py,...frame); }
        });
        ctx.putImageData(image,0,0); return;
      }
      ctx.scale(ratio, ratio); ctx.clearRect(0,0,width,height);
      boards.forEach((board, index) => {
        const ox = (index % cols) * (tileW + gap); const oy = Math.floor(index / cols) * (tileH + gap);
        ctx.fillStyle = "#080b16"; ctx.fillRect(ox,oy,tileW,tileH);
        const cw = tileW / W; const ch = tileH / H;
        board.cells.forEach((code, cellIndex) => {
          if (!code) return; const id = CELL_IDS[code]!; const bx = cellIndex % W; const by = Math.floor(cellIndex / W);
          ctx.fillStyle = COLORS[id];
          ctx.fillRect(ox+bx*cw,oy+by*ch,Math.max(.45,cw-.12),Math.max(.45,ch-.12));
        });
        const isSelected = index === selected;
        ctx.save();
        ctx.strokeStyle = isSelected ? "#e8fdff" : "#29d9ff";
        ctx.lineWidth = isSelected ? Math.min(3, Math.max(1,tileW/25)) : Math.min(2, Math.max(1,tileW/40));
        ctx.shadowColor = "#29d9ff";
        ctx.shadowBlur = tileW > 12 ? 5 : 0;
        ctx.strokeRect(ox+.5,oy+.5,Math.max(1,tileW-1),Math.max(1,tileH-1));
        ctx.restore();
        if (board.paths > 1 && tileW > 42) { ctx.fillStyle = "#fff"; ctx.font = `${Math.max(8,tileW/10)}px monospace`; ctx.fillText(`×${board.paths}`,ox+3,oy+11); }
      });
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(host); return () => observer.disconnect();
  }, [boards, selected]);
  return <div className="universe-wrap" ref={wrap}>
    <canvas ref={ref} onClick={(event) => {
      const r = event.currentTarget.getBoundingClientRect(); const l = layoutRef.current;
      const col = Math.floor((event.clientX-r.left) / l.tileW); const row = Math.floor((event.clientY-r.top) / l.tileH);
      const index = row * l.cols + col; if (index < boards.length) onSelect(index);
    }} aria-label="全候補盤面。クリックで選択" />
  </div>;
}

export default function Home() {
  const [boards, setBoards] = useState<Board[]>([emptyBoard()]);
  const bag = useRef<Pair[]>([]); const [pair, setPair] = useState<Pair>(["I","O"]); const [next, setNext] = useState<Pair>(["T","L"]);
  const [x, setX] = useState(3); const [y, setY] = useState(-1); const [rotation, setRotation] = useState(0);
  const [selected, setSelected] = useState(-1); const [paused, setPaused] = useState(false); const [gameOver, setGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState<"extinction" | "limit" | null>(null);
  const [score, setScore] = useState(0); const [turn, setTurn] = useState(1); const [maxWorlds, setMaxWorlds] = useState(1);
  const [collapse, setCollapse] = useState(0); const [flash, setFlash] = useState(""); const [help, setHelp] = useState(true);
  const [collapseFx, setCollapseFx] = useState<{ key: number; before: number; after: number; rate: number } | null>(null);
  const [calculating, setCalculating] = useState(false);
  const workerRef = useRef<Worker | null>(null); const jobRef = useRef(0);
  const pendingRef = useRef<{ jobId: number; before: number; nextPair: Pair; followingPair: Pair } | null>(null);

  const pullPair = useCallback((): Pair => {
    if (!bag.current.length) bag.current = shuffle(allPairs());
    return bag.current.pop()!;
  }, []);

  const restart = useCallback(() => {
    jobRef.current++;
    bag.current = shuffle(allPairs()); const first = bag.current.pop()!; const second = bag.current.pop()!;
    setBoards([emptyBoard()]); setPair(first); setNext(second); setX(3); setY(-1); setRotation(0);
    setSelected(-1); setPaused(false); setGameOver(false); setGameOverReason(null); setCalculating(false); setScore(0); setTurn(1); setMaxWorlds(1); setCollapse(0); setCollapseFx(null); setFlash("");
  }, []);

  useEffect(() => { restart(); }, [restart]);
  const selectedBoard = boards[selected >= 0 ? Math.min(selected, boards.length - 1) : 0] ?? emptyBoard();

  const makeTone = useCallback((frequency: number, duration = .08) => {
    try { const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const ctx = new AudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = frequency; gain.gain.setValueAtTime(.035,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+duration); } catch { /* audio is optional */ }
  }, []);

  useEffect(() => {
    const worker = new Worker("/quantum-worker.js"); workerRef.current = worker;
    worker.onmessage = ({ data }: MessageEvent<{ jobId: number; count: number; cellsBuffer: ArrayBuffer; pathsBuffer: ArrayBuffer; lastBuffer: ArrayBuffer; heightBuffer: ArrayBuffer; totalLines: number; anyClear: boolean; limitExceeded?: boolean; stateCount?: number }>) => {
      const pending = pendingRef.current; if (!pending || data.jobId !== pending.jobId || data.jobId !== jobRef.current) return;
      if (data.limitExceeded) {
        setCalculating(false); pendingRef.current = null; setGameOver(true); setGameOverReason("limit");
        setFlash("500,000 WORLD LIMIT"); makeTone(62,.65); return;
      }
      const packed = new Uint8Array(data.cellsBuffer); const paths = new Float64Array(data.pathsBuffer); const lasts = new Uint8Array(data.lastBuffer); const heights = new Uint8Array(data.heightBuffer);
      const nextBoards: Board[] = Array.from({ length: data.count }, (_, index) => ({
        cells: packed.subarray(index*W*H,(index+1)*W*H), paths: paths[index], last: CELL_IDS[lasts[index]], height: heights[index],
      }));
      setCalculating(false); pendingRef.current = null;
      if (!nextBoards.length) { setBoards([]); setGameOver(true); setGameOverReason("extinction"); setFlash("NO POSSIBLE WORLD"); makeTone(82,.4); return; }
      const after = worldCount(nextBoards); const rate = data.anyClear ? Math.max(0,1-after/Math.max(1,pending.before*2)) : 0;
      setCollapse(rate); setScore((value) => value + data.totalLines*100 + (data.anyClear ? Math.round(rate*1000) : 0));
      setBoards(nextBoards); setMaxWorlds((value) => Math.max(value,after)); setSelected(-1); setTurn((value) => value+1);
      if (data.anyClear) {
        const key = Date.now(); setCollapseFx({ key, before: pending.before*2, after, rate });
        setTimeout(() => setCollapseFx((current) => current?.key === key ? null : current),1700);
        makeTone(after === 1 ? 660 : 440,.3);
      }
      else makeTone(180,.06);
      setPair(pending.nextPair); setNext(pending.followingPair); setX(3); setY(-1); setRotation(0);
    };
    worker.onerror = () => { setCalculating(false); setFlash("CALCULATION ERROR"); };
    return () => { worker.terminate(); workerRef.current = null; };
  }, [makeTone]);

  const resolve = useCallback(() => {
    if (paused || gameOver || calculating || !workerRef.current) return;
    const packed = new Uint8Array(boards.length*W*H); const pathCounts = new Float64Array(boards.length);
    boards.forEach((board,index) => { packed.set(board.cells,index*W*H); pathCounts[index] = board.paths; });
    const jobId = ++jobRef.current; pendingRef.current = { jobId, before: worldCount(boards), nextPair: next, followingPair: pullPair() };
    setCalculating(true);
    workerRef.current.postMessage({ jobId, count: boards.length, cellsBuffer: packed.buffer, pathsBuffer: pathCounts.buffer, pair: [CELL_CODE[pair[0]],CELL_CODE[pair[1]]], x, y, rotation }, [packed.buffer,pathCounts.buffer]);
  }, [boards, calculating, gameOver, next, pair, paused, pullPair, rotation, x, y]);

  const move = useCallback((dx: number) => {
    if (paused || gameOver || calculating) return; const nx = x + dx;
    if (pair.some((id) => valid(selectedBoard,id,nx,y,rotation))) { setX(nx); makeTone(240,.025); }
  }, [calculating, gameOver, makeTone, pair, paused, rotation, selectedBoard, x, y]);
  const spin = useCallback((dir: number) => {
    if (paused || gameOver || calculating) return; const nr = (rotation+dir+4)%4;
    if (pair.some((id) => valid(selectedBoard,id,x,y,nr))) { setRotation(nr); makeTone(320,.04); }
  }, [calculating, gameOver, makeTone, pair, paused, rotation, selectedBoard, x, y]);
  const down = useCallback(() => {
    if (paused || gameOver || calculating) return;
    if (pair.some((id) => valid(selectedBoard,id,x,y+1,rotation))) setY((v) => v+1); else resolve();
  }, [calculating, gameOver, pair, paused, resolve, rotation, selectedBoard, x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowLeft","ArrowRight","ArrowDown"," "].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft") move(-1); else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowDown") down(); else if (e.key === " ") resolve();
      else if (e.key.toLowerCase() === "z") spin(-1); else if (e.key.toLowerCase() === "x" || e.key === "ArrowUp") spin(1);
      else if (e.key === "Escape") setPaused((p) => !p);
    };
    window.addEventListener("keydown",onKey); return () => window.removeEventListener("keydown",onKey);
  }, [down, move, resolve, spin]);
  useEffect(() => { if (paused || gameOver || help || calculating) return; const id = setInterval(down, 760); return () => clearInterval(id); }, [calculating, down, gameOver, help, paused]);

  const worlds = worldCount(boards); const danger = boards.filter((b) => heightOf(b) >= 16).reduce((n,b) => n+b.paths,0);
  const displayMode = boards.length <= 16 ? "FULL COLOR" : boards.length <= 100 ? "COLOR COMPACT" : boards.length <= 1000 ? "MICRO COLOR" : "COLOR STATES";

  return <main>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><b>Q</b><i /></span><div><h1>QUANTUM <em>STACK</em></h1><p>MANY-WORLD STACKING PUZZLE</p></div></div>
      <div className="stats">
        <div><span>SCORE</span><strong>{score.toLocaleString()}</strong></div><div className="accent"><span>POSSIBLE WORLDS</span><strong>{worlds.toLocaleString()}</strong></div>
        <div><span>MAX WORLDS</span><strong>{maxWorlds.toLocaleString()}</strong></div><div><span>COLLAPSE</span><strong>{(collapse*100).toFixed(1)}%</strong></div>
      </div>
      <div className="header-actions"><button onClick={() => setHelp(true)} aria-label="遊び方">?</button><button onClick={() => setPaused((p) => !p)}>{paused ? "RESUME" : "PAUSE"}</button></div>
    </header>

    <section className="game-layout">
      <aside className="left-panel panel">
        <div className="panel-title"><span>{selected >= 0 ? "SELECTED POSSIBILITY" : "UNOBSERVED SUPERPOSITION"}</span><small>{selected >= 0 ? `#${selected+1} / ${boards.length} · NOT COLLAPSED` : `${worlds.toLocaleString()} WORLDS OVERLAID`}</small></div>
        {boards.length ? selected >= 0
          ? <BoardCanvas board={selectedBoard} pair={pair} x={x} y={y} rotation={rotation} paused={paused} />
          : <SuperpositionCanvas boards={boards} pair={pair} x={x} y={y} rotation={rotation} paused={paused} />
          : <div className="empty-board" />}
        <div className={`possibility-note ${selected >= 0 ? "inspecting" : ""}`}>
          <i />{selected >= 0 ? "候補を拡大確認中 — 世界は確定していません" : "全候補の占有密度を重ねて表示 — 未確定状態"}
          {selected >= 0 && <button onClick={() => setSelected(-1)}>全世界へ戻る</button>}
        </div>
        <div className="board-meta">{selected >= 0 ? <><span>HEIGHT <b>{heightOf(selectedBoard)}</b></span><span>PATHS <b>×{selectedBoard.paths}</b></span></> : <><span>MODE <b>DENSITY</b></span><span>WORLDS <b>{worlds}</b></span></>}<span>TURN <b>{turn}</b></span></div>
      </aside>

      <section className="universe-panel panel">
        <div className="panel-title"><span>SUPERPOSITION FIELD</span><small><i className={`live-dot ${calculating ? "calculating" : ""}`} /> {calculating ? "CALCULATING..." : displayMode}</small></div>
        {boards.length ? <UniverseCanvas boards={boards} selected={selected} onSelect={setSelected} /> : <div className="no-worlds"><b>∅</b><span>NO POSSIBLE WORLD</span></div>}
      </section>

      <aside className="right-panel">
        <section className="panel pair-card">
          <div className="panel-title"><span>QUANTUM MINO</span><small>ACTIVE</small></div>
          <div className="pair-equation"><div><MiniShape id={pair[0]} /><b style={{color:COLORS[pair[0]]}}>{pair[0]}</b></div><span>＋</span><div><MiniShape id={pair[1]} /><b style={{color:COLORS[pair[1]]}}>{pair[1]}</b></div></div>
          <div className="mixed-swatch" style={{background:mixedColor(pair)}}><span>SUPERPOSED COLOR</span><b>{mixedColor(pair).replace("rgba(","RGB ").replace(",1)","")}</b></div>
        </section>
        <section className="panel next-card"><div className="panel-title"><span>NEXT PAIR</span><small>PAIR BAG</small></div><div className="next-row"><MiniShape id={next[0]} /><b>{next[0]}</b><span>＋</span><MiniShape id={next[1]} /><b>{next[1]}</b></div></section>
        <section className="panel analysis-card"><div className="panel-title"><span>WORLD ANALYSIS</span></div>
          <div className="analysis-row"><span>次の最大分岐</span><b>{(worlds*2).toLocaleString()}</b></div><div className="analysis-row"><span>独立盤面</span><b>{boards.length}</b></div><div className="analysis-row danger"><span>消滅危険候補</span><b>{danger}</b></div>
        </section>
        <button className="restart" onClick={restart}>↻ NEW EXPERIMENT</button>
      </aside>
    </section>

    <section className="controls-bar">
      <button disabled={calculating} onClick={() => move(-1)}><kbd>←</kbd><span>LEFT</span></button><button disabled={calculating} onClick={() => move(1)}><kbd>→</kbd><span>RIGHT</span></button>
      <button disabled={calculating} onClick={() => down()}><kbd>↓</kbd><span>SOFT DROP</span></button><button disabled={calculating} onClick={() => spin(-1)}><kbd>Z</kbd><span>ROTATE L</span></button>
      <button disabled={calculating} onClick={() => spin(1)}><kbd>X</kbd><span>ROTATE R</span></button><button disabled={calculating} className="drop" onClick={resolve}><kbd>SPACE</kbd><span>{calculating ? "CALCULATING" : "BRANCH / DROP"}</span></button>
      <p>ラインを作る世界だけが<strong>収束</strong>して生き残る</p>
    </section>

    {flash && <div className="flash" key={flash}>{flash}</div>}
    {collapseFx && <div className={`collapse-fx ${collapseFx.after === 1 ? "perfect" : ""}`} aria-hidden="true">
      <div className="collapse-veil"/><div className="collapse-ring ring-one"/><div className="collapse-ring ring-two"/><div className="collapse-core"/>
      <div className="collapse-particles">{Array.from({length:32},(_,index) => <i key={index} style={{"--angle":`${index*11.25}deg`,"--distance":`${120+(index%7)*22}px`,"--delay":`${(index%8)*.025}s`} as CSSProperties}/>)}</div>
      <div className="collapse-copy"><small>POST-SELECTION EVENT</small><strong>{collapseFx.after === 1 ? "PERFECT COLLAPSE" : "WORLD COLLAPSE"}</strong><div><b>{collapseFx.before.toLocaleString()}</b><span>→</span><b>{collapseFx.after.toLocaleString()}</b></div><em>{(collapseFx.rate*100).toFixed(2)}% ELIMINATED</em></div>
    </div>}
    {(paused || gameOver) && !help && <div className="overlay"><div><small>EXPERIMENT STATUS</small><h2>{gameOver ? gameOverReason === "limit" ? "WORLD LIMIT EXCEEDED" : "NO POSSIBLE WORLD" : "PAUSED"}</h2><p>{gameOver ? gameOverReason === "limit" ? "可能性が500,000状態を超えました。ブラウザーを保護するため実験を強制終了します。" : `${turn}ターンの観測で、すべての可能性が消滅しました。` : "可能性の時間発展を停止しています。"}</p><button onClick={gameOver ? restart : () => setPaused(false)}>{gameOver ? "NEW EXPERIMENT" : "RESUME"}</button></div></div>}
    {help && <div className="overlay help"><div><button className="close" onClick={() => setHelp(false)}>×</button><small>HOW TO PLAY</small><h2>2つを落とし、<br/><em>残る世界</em>を選ぶ。</h2><ol><li><b>重ね合わせる</b><span>色の混ざった2種類のミノを同時に動かします。</span></li><li><b>分岐する</b><span>着地すると各形が別々の盤面候補になります。</span></li><li><b>収束させる</b><span>どこかでラインが完成すると、その世界だけが残ります。</span></li></ol><button className="start" onClick={() => setHelp(false)}>START EXPERIMENT <span>SPACE</span></button></div></div>}
  </main>;
}
