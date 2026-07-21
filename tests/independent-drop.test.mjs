import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/quantum-worker.js", import.meta.url), "utf8");

function runWorker({ cells, pair, x, y, rotation = 0 }) {
  let response;
  const self = {
    postMessage(message) { response = message; },
  };
  vm.runInNewContext(workerSource, { self, Uint8Array, Float64Array, Map, Math, String });
  const packed = new Uint8Array(cells);
  const paths = new Float64Array([1]);
  self.onmessage({ data: {
    jobId: 1,
    count: 1,
    cellsBuffer: packed.buffer,
    pathsBuffer: paths.buffer,
    pair,
    x,
    y,
    rotation,
  } });
  return response;
}

test("each mino drops independently from the top even when the visual heights differ", () => {
  const cells = new Uint8Array(10 * 20);
  cells[19 * 10 + 3] = 3;

  const fromTop = runWorker({ cells, pair: [1, 2], x: 3, y: -1 });
  const afterLongSoftDrop = runWorker({ cells, pair: [1, 2], x: 3, y: 18 });

  assert.equal(fromTop.count, 2);
  assert.equal(afterLongSoftDrop.count, 2);
  assert.deepEqual(
    [...new Uint8Array(afterLongSoftDrop.lastBuffer)].sort(),
    [1, 2],
  );
  assert.deepEqual(
    [...new Uint8Array(afterLongSoftDrop.cellsBuffer)],
    [...new Uint8Array(fromTop.cellsBuffer)],
  );
});
