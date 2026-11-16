import assert from 'node:assert/strict';
import test from 'node:test';
import { autoGrid } from './gridLayout.ts';

const wide = 1600; // desktop monitoring wall
const tall = 1000; // window height

test('columns follow the number of screens on the page', () => {
  assert.equal(autoGrid(1, wide, tall).columns, 1);
  assert.equal(autoGrid(2, wide, tall).columns, 2);
  assert.equal(autoGrid(3, wide, tall).columns, 3);
  assert.equal(autoGrid(4, wide, tall).columns, 2); // 2x2
  assert.equal(autoGrid(6, wide, tall).columns, 3); // 3x2
  assert.equal(autoGrid(9, wide, tall).columns, 3); // 3x3
  assert.equal(autoGrid(16, wide, tall).columns, 4); // 4x4
});

test('columns never exceed what fits the screen width', () => {
  assert.equal(autoGrid(9, 360, tall).columns, 1); // phone
  assert.equal(autoGrid(9, 700, tall).columns, 2); // tablet
  assert.equal(autoGrid(48, wide, tall).columns, 5); // 260px minimum tile width
});

test('small walls are sized to fit on screen without scrolling', () => {
  const single = autoGrid(1, wide, tall);
  // One 16:9 tile, no taller than the space below the toolbar (1000 - 300).
  assert.ok(single.maxWidth !== undefined && single.maxWidth <= (700 * 16) / 9 + 1);
  const quad = autoGrid(4, wide, tall);
  assert.ok(quad.maxWidth !== undefined && quad.maxWidth < wide);
  // Large walls scroll instead of shrinking.
  assert.equal(autoGrid(24, wide, tall).maxWidth, undefined);
});

test('an empty page falls back to one column', () => {
  assert.deepEqual(autoGrid(0, wide, tall), { columns: 1 });
});
