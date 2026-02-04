import { expect, test } from '@playwright/test';
import { LATEST_DATA_VERSION } from '@wodbrains/core';

test('first generate requires click-through legal consent', async ({ page }) => {
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 burpees');
  await page.locator('#generate').click();

  const accept = page.locator('#legalAccept');
  await expect(accept).toBeVisible();
  await expect(accept).toBeDisabled();

  await page.locator('#legalAgreeCheck').check();
  await expect(accept).toBeEnabled();

  await accept.click();

  await expect(page).toHaveURL(/\/w\//);
  await expect(page.locator('[data-testid="builder-tree"]')).toBeVisible();

  // Acceptance persists for subsequent generates.
  await page.goto('/');
  await page.locator('#input').fill('For time: 10 burpees');
  await page.locator('#generate').click();
  await expect(page.locator('#legalAccept')).toHaveCount(0);
  await expect(page).toHaveURL(/\/w\//);
});

test('viewing a run requires click-through legal consent', async ({ page }) => {
  const timerPlan = {
    id: 'legal-run-plan',
    schemaVersion: LATEST_DATA_VERSION,
    title: 'Legal Run Test',
    root: {
      type: 'sequence',
      blockId: 'root',
      label: 'Workout',
      segments: [
        { type: 'timer', blockId: 'prep', label: 'Prep', mode: 'countdown', durationMs: 2000 },
      ],
    },
  };

  await page.goto('/');
  // Runs require an authenticated (anonymous) session cookie.
  const runId = await page.evaluate(async (plan) => {
    await fetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timerPlan: plan }),
    });
    if (!res.ok) throw new Error(`create run failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { runId?: string };
    if (!json.runId) throw new Error('runId missing');
    return json.runId;
  }, timerPlan);

  await page.goto(`/r/${encodeURIComponent(runId)}`);
  await expect(page.locator('#legalAccept')).toBeVisible();

  await page.locator('#legalAgreeCheck').check();
  await page.locator('#legalAccept').click();

  await expect(page.locator('#timerValue')).toBeVisible();
});

test('declining run consent does not leak global listeners', async ({ page }) => {
  await page.addInitScript(() => {
    const ids = new WeakMap<object, number>();
    let nextId = 1;
    const getId = (listener: unknown): number => {
      if (!listener || (typeof listener !== 'function' && typeof listener !== 'object')) return 0;
      const obj = listener as object;
      const existing = ids.get(obj);
      if (existing) return existing;
      const id = nextId++;
      ids.set(obj, id);
      return id;
    };
    const getCapture = (options: unknown): boolean => {
      if (typeof options === 'boolean') return options;
      if (!options || typeof options !== 'object') return false;
      return !!(options as { capture?: unknown }).capture;
    };

    const active = new Set<string>();
    const origAdd = EventTarget.prototype.addEventListener;
    const origRemove = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (type: string, listener: any, options: any) {
      if (this === window || this === document) {
        const target = this === window ? 'window' : 'document';
        const id = getId(listener);
        const capture = getCapture(options) ? '1' : '0';
        active.add(`${target}|${type}|${id}|${capture}`);
      }
      return origAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: any,
      options: any,
    ) {
      if (this === window || this === document) {
        const target = this === window ? 'window' : 'document';
        const id = getId(listener);
        const capture = getCapture(options) ? '1' : '0';
        active.delete(`${target}|${type}|${id}|${capture}`);
      }
      return origRemove.call(this, type, listener, options);
    };

    (window as any).__listenerTracker = {
      snapshot: () => {
        const count = (target: string, type: string) => {
          let n = 0;
          for (const key of active) {
            if (key.startsWith(`${target}|${type}|`)) n++;
          }
          return n;
        };
        return {
          document: {
            mousemove: count('document', 'mousemove'),
            fullscreenchange: count('document', 'fullscreenchange'),
            webkitfullscreenchange: count('document', 'webkitfullscreenchange'),
            MSFullscreenChange: count('document', 'MSFullscreenChange'),
          },
          window: {
            keydown: count('window', 'keydown'),
            online: count('window', 'online'),
            popstate: count('window', 'popstate'),
            pagehide: count('window', 'pagehide'),
          },
        };
      },
    };
  });

  const timerPlan = {
    id: 'legal-run-decline-plan',
    schemaVersion: LATEST_DATA_VERSION,
    title: 'Legal Decline Test',
    root: {
      type: 'sequence',
      blockId: 'root',
      label: 'Workout',
      segments: [
        { type: 'timer', blockId: 'prep', label: 'Prep', mode: 'countdown', durationMs: 2000 },
      ],
    },
  };

  await page.goto('/');
  const baseline = await page.evaluate(() => (window as any).__listenerTracker.snapshot());

  const runId = await page.evaluate(async (plan) => {
    await fetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timerPlan: plan }),
    });
    if (!res.ok) throw new Error(`create run failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { runId?: string };
    if (!json.runId) throw new Error('runId missing');
    return json.runId;
  }, timerPlan);

  for (let i = 0; i < 2; i++) {
    await page.goto(`/r/${encodeURIComponent(runId)}`);
    await expect(page.locator('#legalAccept')).toBeVisible();
    await page.locator('#legalDecline').click();
    await expect(page).toHaveURL(/\/$/);

    const snap = await page.evaluate(() => (window as any).__listenerTracker.snapshot());
    expect(snap).toEqual(baseline);
  }
});
