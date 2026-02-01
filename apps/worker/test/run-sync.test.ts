import { describe, expect, it } from 'vitest';
import { SELF } from 'cloudflare:test';

const signInAnon = async (): Promise<string> => {
  const signIn = await SELF.fetch('https://example.com/api/auth/sign-in/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(signIn.status).toBe(200);
  const setCookie = signIn.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0];
};

const createRun = async (cookie: string): Promise<string> => {
  const create = await SELF.fetch('https://example.com/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ timerPlan: { id: 'plan', mode: 'countup' } }),
  });
  expect(create.status).toBe(200);
  const created = (await create.json()) as { runId: string };
  return created.runId;
};

const connectWsWithSnapshot = async (
  runId: string,
  cookie?: string,
): Promise<{ ws: WebSocket; message: any }> => {
  const res = await SELF.fetch(`https://example.com/api/runs/${runId}/ws`, {
    headers: { Upgrade: 'websocket', ...(cookie ? { cookie } : {}) },
  });
  expect(res.status).toBe(101);
  if (!res.webSocket) throw new Error('Missing webSocket on response');
  const ws = res.webSocket;
  const firstMessage = new Promise((resolve) => {
    ws.addEventListener(
      'message',
      (ev) => {
        const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
        resolve(JSON.parse(data));
      },
      { once: true },
    );
  });
  ws.accept();
  const message = await firstMessage;
  return { ws, message };
};

describe('Run sync websocket', () => {
  it('broadcasts online count to multiple clients', async () => {
    const cookie = await signInAnon();
    const runId = await createRun(cookie);

    const { ws: ws1, message: msg1 } = await connectWsWithSnapshot(runId, cookie);
    expect(msg1.snapshot?.onlineCount).toBe(1);
    expect(typeof msg1.snapshot?.serverNowMonoMs).toBe('number');

    const { ws: ws2, message: msg2 } = await connectWsWithSnapshot(runId, cookie);
    expect(msg2.snapshot?.onlineCount).toBe(2);

    ws2.close();
    ws1.close();
  });

  it('returns monotonic server time in snapshots', async () => {
    const cookie = await signInAnon();
    const runId = await createRun(cookie);

    const snap1 = await SELF.fetch(`https://example.com/api/runs/${runId}`, { headers: { cookie } });
    const s1 = (await snap1.json()) as { serverNowMonoMs?: number };
    await new Promise((resolve) => setTimeout(resolve, 10));
    const snap2 = await SELF.fetch(`https://example.com/api/runs/${runId}`, { headers: { cookie } });
    const s2 = (await snap2.json()) as { serverNowMonoMs?: number };
    expect(typeof s1.serverNowMonoMs).toBe('number');
    expect(typeof s2.serverNowMonoMs).toBe('number');
    expect((s2.serverNowMonoMs ?? 0) >= (s1.serverNowMonoMs ?? 0)).toBe(true);
  });
});

describe('Run access control', () => {
  it('blocks non-owners from posting events and settings', async () => {
    const ownerCookie = await signInAnon();
    const viewerCookie = await signInAnon();
    const runId = await createRun(ownerCookie);

    const blockedEvent = await SELF.fetch(`https://example.com/api/runs/${runId}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: viewerCookie },
      body: JSON.stringify({ type: 'start', atMs: 0 }),
    });
    expect(blockedEvent.status).toBe(403);

    const okSettings = await SELF.fetch(`https://example.com/api/runs/${runId}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: ownerCookie },
      body: JSON.stringify({ timeScale: 100 }),
    });
    expect(okSettings.status).toBe(200);
    const settingsSnap = (await okSettings.json()) as { timeScale?: number };
    expect(settingsSnap.timeScale).toBe(100);

    const blockedSettings = await SELF.fetch(`https://example.com/api/runs/${runId}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: viewerCookie },
      body: JSON.stringify({ timeScale: 10 }),
    });
    expect(blockedSettings.status).toBe(403);
  });
});
