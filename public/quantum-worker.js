const W = 10;
const H = 20;
const SIZE = W * H;
const WORLD_LIMIT = 50000;
const SPAWN_Y = -4;
const SHAPES = [
  null,
  [[0,1],[1,1],[2,1],[3,1]],
  [[1,0],[2,0],[1,1],[2,1]],
  [[1,0],[0,1],[1,1],[2,1]],
  [[1,0],[2,0],[0,1],[1,1]],
  [[0,0],[1,0],[1,1],[2,1]],
  [[0,0],[0,1],[1,1],[2,1]],
  [[2,0],[0,1],[1,1],[2,1]],
];

function rotatedPoints(id, rotation) {
  if (id === 2) return SHAPES[id];
  const edge = id === 1 ? 3 : 2;
  return SHAPES[id].map(([x0,y0]) => {
    let x = x0; let y = y0;
    for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) [x,y] = [edge-y,x];
    return [x,y];
  });
}

function valid(cells, shape, x, y) {
  for (const [dx,dy] of shape) {
    const bx = x+dx; const by = y+dy;
    if (bx < 0 || bx >= W || by >= H || (by >= 0 && cells[by*W+bx])) return false;
  }
  return true;
}

function landingY(cells, shape, x, y) {
  if (!valid(cells,shape,x,y)) return null;
  let finalY = y;
  while (valid(cells,shape,x,finalY+1)) finalY++;
  return finalY;
}

function place(cells, id, shape, x, y) {
  const placed = new Uint8Array(cells);
  for (const [dx,dy] of shape) {
    const bx = x+dx; const by = y+dy;
    if (by < 0 || by >= H || bx < 0 || bx >= W || placed[by*W+bx]) return null;
    placed[by*W+bx] = id;
  }
  let cleared = 0;
  for (let by = 0; by < H; by++) {
    let full = true;
    for (let bx = 0; bx < W; bx++) if (!placed[by*W+bx]) { full = false; break; }
    if (full) cleared++;
  }
  if (!cleared) return { cells: placed, cleared: 0 };
  const compacted = new Uint8Array(SIZE); let target = H-1;
  for (let by = H-1; by >= 0; by--) {
    let full = true;
    for (let bx = 0; bx < W; bx++) if (!placed[by*W+bx]) { full = false; break; }
    if (!full) { compacted.set(placed.subarray(by*W,by*W+W),target*W); target--; }
  }
  return { cells: compacted, cleared };
}

function keyOf(cells) {
  let key = "";
  for (let offset = 0; offset < SIZE; offset += 50) key += String.fromCharCode(...cells.subarray(offset,offset+50));
  return key;
}

function heightOf(cells) {
  for (let by = 0; by < H; by++) for (let bx = 0; bx < W; bx++) if (cells[by*W+bx]) return H-by;
  return 0;
}

self.onmessage = ({ data }) => {
  const { jobId, count, cellsBuffer, pathsBuffer, pair, x, rotation } = data;
  const packed = new Uint8Array(cellsBuffer); const paths = new Float64Array(pathsBuffer);
  const clearedMap = new Map(); const plainMap = new Map();
  let clearedWorlds = 0; let plainWorlds = 0; let clearedExceeded = false; let plainExceeded = false; let totalLines = 0;
  const record = (branch, lineClear) => {
    if (lineClear) { clearedWorlds += branch.paths; totalLines += branch.cleared * branch.paths; }
    else plainWorlds += branch.paths;
    const worlds = lineClear ? clearedWorlds : plainWorlds;
    if (worlds > WORLD_LIMIT) { if (lineClear) clearedExceeded = true; else plainExceeded = true; return; }
    if (lineClear ? clearedExceeded : plainExceeded) return;
    const map = lineClear ? clearedMap : plainMap; const key = keyOf(branch.cells); const same = map.get(key);
    if (same) same.paths += branch.paths;
    else if (map.size >= WORLD_LIMIT) { if (lineClear) clearedExceeded = true; else plainExceeded = true; }
    else map.set(key,branch);
  };
  const shapeA = rotatedPoints(pair[0],rotation); const shapeB = rotatedPoints(pair[1],rotation);
  let stop = false;
  for (let index = 0; index < count; index++) {
    const cells = packed.subarray(index*SIZE,(index+1)*SIZE); const pathCount = paths[index];
    for (const [id,shape] of [[pair[0],shapeA],[pair[1],shapeB]]) {
      const ly = landingY(cells,shape,x,SPAWN_Y); if (ly === null) continue;
      const result = place(cells,id,shape,x,ly); if (!result) continue;
      const branch = { cells: result.cells, paths: pathCount, last: id, cleared: result.cleared };
      record(branch,result.cleared > 0);
      if (clearedExceeded) { stop = true; break; }
    }
    if (stop) break;
  }
  const anyClear = clearedWorlds > 0; const limitExceeded = anyClear ? clearedExceeded : plainExceeded;
  if (limitExceeded) {
    const stateCount = anyClear ? Math.max(clearedWorlds,clearedMap.size+1) : Math.max(plainWorlds,plainMap.size+1);
    self.postMessage({ jobId, limitExceeded: true, stateCount }); return;
  }
  const merged = anyClear ? clearedMap : plainMap;
  const results = [...merged.values()]; results.forEach((board) => { board.height = heightOf(board.cells); }); results.sort((a,b) => a.height-b.height);
  const outCells = new Uint8Array(results.length*SIZE); const outPaths = new Float64Array(results.length); const outLast = new Uint8Array(results.length); const outHeight = new Uint8Array(results.length);
  results.forEach((board,index) => { outCells.set(board.cells,index*SIZE); outPaths[index] = board.paths; outLast[index] = board.last; outHeight[index] = board.height; });
  self.postMessage({ jobId, count: results.length, cellsBuffer: outCells.buffer, pathsBuffer: outPaths.buffer, lastBuffer: outLast.buffer, heightBuffer: outHeight.buffer, totalLines, anyClear }, [outCells.buffer,outPaths.buffer,outLast.buffer,outHeight.buffer]);
};
