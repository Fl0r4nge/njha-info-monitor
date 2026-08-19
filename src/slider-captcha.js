import { PNG } from 'pngjs';

const DEFAULT_SELECTORS = {
  background: '.verify-img-panel img',
  piece: '.verify-sub-block img',
  handle: '.verify-move-block',
  dialog: '.verifybox'
};

export async function solveSliderCaptcha(page, selectors = DEFAULT_SELECTORS) {
  await page.waitForSelector(selectors.dialog, { state: 'visible' });

  const backgroundSource = await page.locator(selectors.background).getAttribute('src');
  const pieceSource = await page.locator(selectors.piece).getAttribute('src');
  if (!backgroundSource || !pieceSource) {
    throw new Error('Slider captcha images were not found');
  }

  const match = findPuzzleOffset(decodeDataUrl(backgroundSource), decodeDataUrl(pieceSource));
  const backgroundBox = await page.locator(selectors.background).boundingBox();
  const handleBox = await page.locator(selectors.handle).boundingBox();
  if (!backgroundBox || !handleBox) {
    throw new Error('Slider captcha geometry is unavailable');
  }

  const distance = match.offset * backgroundBox.width / match.backgroundWidth;
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let index = 1; index <= 24; index += 1) {
    const progress = index / 24;
    const eased = 1 - Math.pow(1 - progress, 2);
    await page.mouse.move(
      startX + distance * eased,
      startY + Math.sin(progress * Math.PI * 2) * 1.2
    );
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);

  if (await page.locator(selectors.dialog).isVisible().catch(() => false)) {
    throw new Error('Slider captcha verification failed; a new confirmation is required before retrying');
  }

  return { distance, confidence: match.confidence };
}

export function findPuzzleOffset(backgroundBuffer, pieceBuffer) {
  const background = PNG.sync.read(backgroundBuffer);
  const piece = PNG.sync.read(pieceBuffer);
  if (background.height !== piece.height || background.width < piece.width) {
    throw new Error('Unexpected slider captcha image dimensions');
  }

  let bestOffset = -1;
  let bestScore = -Infinity;

  for (let offset = 0; offset <= background.width - piece.width; offset += 1) {
    let dot = 0;
    let backgroundEnergy = 0;
    let pieceEnergy = 0;

    for (let y = 0; y < piece.height; y += 1) {
      for (let x = 0; x < piece.width; x += 1) {
        const pieceIndex = (y * piece.width + x) * 4;
        if (piece.data[pieceIndex + 3] === 0) {
          continue;
        }

        const backgroundIndex = (y * background.width + x + offset) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const pieceValue = piece.data[pieceIndex + channel];
          const backgroundValue = background.data[backgroundIndex + channel];
          dot += pieceValue * backgroundValue;
          pieceEnergy += pieceValue * pieceValue;
          backgroundEnergy += backgroundValue * backgroundValue;
        }
      }
    }

    const score = dot / Math.sqrt(pieceEnergy * backgroundEnergy || 1);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  return {
    offset: bestOffset,
    confidence: bestScore,
    backgroundWidth: background.width
  };
}

function decodeDataUrl(value) {
  const match = /^data:image\/[^;]+;base64,(.+)$/s.exec(value);
  if (!match) {
    throw new Error('Slider captcha image is not a base64 data URL');
  }
  return Buffer.from(match[1], 'base64');
}
