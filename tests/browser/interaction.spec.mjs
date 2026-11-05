import { test, expect } from '@playwright/test';

test('manual letter transition preserves every DOM sticker, reaches A, supports orbit and reset', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'warning' && message.text().includes('[cube-type]')) errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'ALICEILEAF', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.stickerSnapshot = [...document.querySelectorAll('.cube-type__block:first-child .cube-type__px')].map(el => ({ el, lit: el.classList.contains('cube-type__px--lit') }));
  });
  const scene = page.getByRole('img', { name: 'ALICEILEAF', exact: true });
  await scene.click();
  await expect.poll(() => page.evaluate(() => {
    const b = window.CubeType.blocks[0]; return b.started && b.idle;
  }), { timeout: 30000 }).toBe(true);
  const result = await page.evaluate(() => {
    const api = window.CubeType, b = api.blocks[0];
    return {
      face: api.frontVals(api.stateOf(b)),
      unchanged: window.stickerSnapshot.every(({el,lit}) => el.isConnected && el.classList.contains('cube-type__px--lit') === lit),
      count: b.cube.querySelectorAll('.cube-type__px').length,
      transforms: b.cubelets.every(c => {
        const style = getComputedStyle(c.el);
        const m = new DOMMatrix(style.transform);
        const spacing = parseFloat(style.width);
        const placed = Number.isFinite(spacing) && spacing > 0 &&
          [m.m41,m.m42,m.m43].every((v,i) => Math.abs(v - c.pos[i] * spacing) < .1);
        return placed && [[m.m11,m.m21,m.m31],[m.m12,m.m22,m.m32],[m.m13,m.m23,m.m33]].every((row,i) => row.every((v,j) => Math.abs(v-c.orient[i][j]) < .001));
      }),
    };
  });
  expect(result.face).toEqual(Array.from(['..###..','.#...#.','#.....#','#.....#','#######','#.....#','#.....#'].join(''), ch => ch === '#' ? 1 : 0));
  await page.screenshot({ path: test.info().outputPath('cube-letter.png') });
  expect(result.unchanged).toBe(true); expect(result.count).toBe(294); expect(result.transforms).toBe(true);
  const cube = page.locator('.cube-type__cube').first();
  const before = await cube.getAttribute('style');
  const box = await scene.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 8 }); await page.mouse.up();
  await expect(cube).not.toHaveAttribute('style', before);
  await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
  expect(await page.evaluate(() => window.CubeType.frontVals(window.CubeType.stateOf(window.CubeType.blocks[0])))).toEqual(Array(49).fill(0));
  expect(errors).toEqual([]);
});

test('reduced-motion mode does not automatically start either cube', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cube-type__scene')).toHaveCount(2);
  // More than the normal boot delays (700ms and 2100ms).
  await page.waitForTimeout(2400);
  expect(await page.evaluate(() => window.CubeType.blocks.every(b => !b.started && b.idle && window.CubeType.turnBusy(b) === 0))).toBe(true);
});
