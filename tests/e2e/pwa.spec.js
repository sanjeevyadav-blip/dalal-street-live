// docs/10-TEST-PLAN.md §10.5 — the PWA surface.
//
// This file exists because the first E2E run on this branch found the PWA broken. EPIC-1
// moved manifest.json and sw.js under src/, and the Vite build — configured publicDir:false —
// emitted neither, while the page went on referencing both. The manifest 404'd and sw.js was
// served the HTML fallback, so registration died with "unsupported MIME type ('text/html')".
// All 217 offline tests passed throughout: not one of them looked at what lands in dist/
// beside index.html.
//
// tests/unit/build-output.test.js now asserts both files are emitted, which is the cheap
// check. These are the ones that prove the browser accepts them.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts } from './helpers/fixture-routes.js';

test.describe('PWA', () => {
  test.beforeEach(async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
  });

  test('the manifest is served, is JSON, and declares a standalone app', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveCount(1);

    const href = await link.getAttribute('href');
    const res = await page.request.get(new URL(href, page.url()).toString());
    expect(res.status(), 'manifest did not return 200').toBe(200);

    const manifest = await res.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBe('Dalal Street Live');
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBeTruthy();
  });

  test('sw.js is served as JavaScript, not as the HTML fallback', async ({ page }) => {
    await page.goto('/');
    const res = await page.request.get(new URL('sw.js', page.url()).toString());
    expect(res.status()).toBe(200);
    // The exact failure that shipped: a 200 whose content-type is text/html, which the
    // browser refuses to register.
    expect(res.headers()['content-type']).toMatch(/javascript/);
    expect(await res.text()).toContain('addEventListener');
  });

  test('the service worker registers and activates', async ({ page }) => {
    await page.goto('/');
    const state = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return 'no-registration';
      const w = reg.active || reg.installing || reg.waiting;
      return w ? w.state : 'no-worker';
    });
    expect(['activated', 'activating', 'installing']).toContain(state);
  });

  test('registering the worker logs no error', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('/');
    await page.waitForTimeout(2000);
    expect(errors.filter((e) => /MIME|service ?worker/i.test(e))).toEqual([]);
  });
});
