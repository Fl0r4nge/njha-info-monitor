import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

import { findPuzzleOffset, solveSliderCaptcha } from '../src/slider-captcha.js';

test('findPuzzleOffset locates the matching horizontal fragment', () => {
  const { background, piece, expectedOffset } = sliderImages();

  const match = findPuzzleOffset(PNG.sync.write(background), PNG.sync.write(piece));
  assert.equal(match.offset, expectedOffset);
  assert.ok(match.confidence > 0.999);
});

test('solveSliderCaptcha detects the gap and performs the complete drag gesture', async () => {
  const { background, piece, expectedOffset } = sliderImages();
  const sources = {
    '.verify-img-panel img': dataUrl(background),
    '.verify-sub-block img': dataUrl(piece),
  };
  const boxes = {
    '.verify-img-panel img': { x: 0, y: 0, width: 200, height: 60 },
    '.verify-move-block': { x: 10, y: 70, width: 20, height: 20 },
  };
  const moves = [];
  let mouseDown = false;
  let mouseUp = false;
  const page = {
    waitForSelector: async (selector, options) => {
      assert.equal(selector, '.verifybox');
      assert.deepEqual(options, { state: 'visible' });
    },
    locator: (selector) => ({
      getAttribute: async (name) => {
        assert.equal(name, 'src');
        return sources[selector];
      },
      boundingBox: async () => boxes[selector],
      isVisible: async () => false,
    }),
    mouse: {
      move: async (x, y) => moves.push({ x, y }),
      down: async () => { mouseDown = true; },
      up: async () => { mouseUp = true; },
    },
    waitForTimeout: async () => {},
  };

  const result = await solveSliderCaptcha(page);
  const expectedDistance = expectedOffset * boxes['.verify-img-panel img'].width / background.width;
  const startX = boxes['.verify-move-block'].x + boxes['.verify-move-block'].width / 2;

  assert.equal(result.distance, expectedDistance);
  assert.ok(result.confidence > 0.999);
  assert.equal(mouseDown, true);
  assert.equal(mouseUp, true);
  assert.equal(moves.length, 25);
  assert.equal(moves.at(-1).x, startX + expectedDistance);
});

function sliderImages() {
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
  return { background, piece, expectedOffset };
}

function dataUrl(imageValue) {
  return `data:image/png;base64,${PNG.sync.write(imageValue).toString('base64')}`;
}

function image(width, height) {
  return new PNG({ width, height });
}

function setPixel(imageValue, x, y, rgba) {
  const index = (y * imageValue.width + x) * 4;
  imageValue.data.set(rgba, index);
}
