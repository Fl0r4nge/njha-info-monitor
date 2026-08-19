import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

import { findPuzzleOffset } from '../src/slider-captcha.js';

test('findPuzzleOffset locates the matching horizontal fragment', () => {
  const background = image(20, 6);
  for (let y = 0; y < background.height; y += 1) {
    for (let x = 0; x < background.width; x += 1) {
      setPixel(background, x, y, [x * 7, y * 19, (x + y) * 5, 255]);
    }
  }

  const piece = image(5, 6);
  const expectedOffset = 11;
  for (let y = 0; y < piece.height; y += 1) {
    for (let x = 0; x < piece.width; x += 1) {
      const sourceIndex = (y * background.width + x + expectedOffset) * 4;
      setPixel(piece, x, y, [
        background.data[sourceIndex],
        background.data[sourceIndex + 1],
        background.data[sourceIndex + 2],
        x === 0 && y === 0 ? 0 : 255
      ]);
    }
  }

  const match = findPuzzleOffset(PNG.sync.write(background), PNG.sync.write(piece));
  assert.equal(match.offset, expectedOffset);
  assert.ok(match.confidence > 0.999);
});

function image(width, height) {
  return new PNG({ width, height });
}

function setPixel(imageValue, x, y, rgba) {
  const index = (y * imageValue.width + x) * 4;
  imageValue.data.set(rgba, index);
}
