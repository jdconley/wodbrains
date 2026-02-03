import {
  clearConnectionIssue,
  setConnectionIssue,
  type ConnectionIssueKind,
} from './components/connection-pill.ts';
import {
  DerivedRunStateSchema,
  RunEventSchema,
  TimerPlanSchema,
  WorkoutDefinitionSchema,
  type DerivedRunState,
  type RunEvent,
  type TimerPlan,
  type WorkoutDefinition,
} from '@wodbrains/core';

export type AuthSessionResponse = {
  session: { id: string; token: string; userId: string };
  user: { id: string; isAnonymous?: boolean; email?: string; name?: string };
} | null;

type FetchRetryOptions = {
  idempotencyKey?: string;
  maxAttempts?: number;
};

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 350;
const MAX_BACKOFF_MS = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isAbortError = (err: unknown) =>
  typeof err === 'object' &&
  err !== null &&
  'name' in err &&
  (err as { name?: string }).name === 'AbortError';

const getRetryAfterMs = (res: Response): number | null => {
  const header = res.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
};

const classifyRetryableStatus = (status: number): ConnectionIssueKind | null => {
  if (status === 429) return 'rate';
  if (status >= 500) return 'server';
  if (status === 408 || status === 425) return 'network';
  return null;
};

const jitterDelayMs = (attempt: number) => {
  const cap = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
  return Math.floor(Math.random() * cap);
};

const createIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

async function fetchWithRetries(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const idempotencyKey = opts.idempotencyKey;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const headers = new Headers(init.headers);
    if (idempotencyKey) headers.set('x-idempotency-key', idempotencyKey);

    try {
      const res = await fetch(input, { ...init, headers });
      if (res.ok) {
        clearConnectionIssue();
        return res;
      }

      if (RETRY_STATUS.has(res.status) && attempt < maxAttempts) {
        const issue = classifyRetryableStatus(res.status);
        if (issue) setConnectionIssue(issue);
        const retryAfter = getRetryAfterMs(res);
        const delay = Math.max(jitterDelayMs(attempt), retryAfter ?? 0);
        await sleep(delay);
        continue;
      }

      if (!RETRY_STATUS.has(res.status)) {
        clearConnectionIssue();
      } else {
        const issue = classifyRetryableStatus(res.status);
        if (issue) setConnectionIssue(issue);
      }
      return res;
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
      setConnectionIssue('network');

      if (attempt < maxAttempts) {
        await sleep(jitterDelayMs(attempt));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

export async function getSession(): Promise<AuthSessionResponse> {
  const res = await fetchWithRetries('/api/auth/get-session', { credentials: 'include' });
  if (!res.ok) throw new Error(`get-session failed: ${res.status}`);
  return (await res.json()) as AuthSessionResponse;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  raw?: string;
  parseId?: string;
  requestId?: string;

  constructor(status: number, message: string, opts?: { code?: string; raw?: string }) {
    super(message);
    this.status = status;
    this.code = opts?.code;
    this.raw = opts?.raw;
  }
}

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const userMessageForApiError = (status: number, code?: string): string => {
  switch (code) {
    case 'parse_failed':
      return "Couldn't generate a timer from that. Please try again.";
    case 'url_retrieval_failed':
      return "Couldn't read that URL. Please try again, or paste the workout text.";
    case 'image_retrieval_failed':
      return "Couldn't read that image URL. Please try again, or upload the image.";
    case 'unsupported_media_type':
      return "That input format isn't supported. Please try again.";
    case 'bad_request':
      return 'Something looks off with that request. Please try again.';
    case 'not_found':
      return 'Not found.';
    case 'timer_locked':
      return 'Workout is locked once a run starts.';
    default:
      if (status === 401) return 'Please sign in and try again.';
      if (status === 403) return "You don't have access to that.";
      if (status === 404) return 'Not found.';
      if (status === 429) return "We're getting rate limited. Please try again.";
      if (status >= 500) return 'Something went wrong. Please try again.';
      return 'Request failed. Please try again.';
  }
};

const readApiError = async (res: Response): Promise<ApiError> => {
  const rawText = await res.text().catch(() => '');
  const json = rawText ? safeJsonParse(rawText) : undefined;

  let code: string | undefined;
  let rawMessage: string | undefined;
  let parseId: string | undefined;
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const record = json as Record<string, unknown>;
    if (typeof record.error === 'string') code = record.error;
    if (typeof record.message === 'string') rawMessage = record.message;
    if (typeof record.parseId === 'string') parseId = record.parseId;
  }

  const message = userMessageForApiError(res.status, code);
  const raw = (rawMessage ?? rawText).slice(0, 800);
  const err = new ApiError(res.status, message, { code, raw });
  err.parseId = parseId;
  return err;
};

const throwApiError = async (res: Response): Promise<never> => {
  throw await readApiError(res);
};

export async function signInAnonymous(): Promise<void> {
  const res = await fetchWithRetries('/api/auth/sign-in/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  if (!res.ok) await throwApiError(res);
}

export async function ensureAnonymousSession(): Promise<void> {
  try {
    const session = await getSession();
    if (session) return;
  } catch {
    // ignore and try to sign in
  }
  await signInAnonymous();
}

export type ParseResponse = {
  workoutDefinition: WorkoutDefinition;
  timerPlan: TimerPlan;
  assumptions: string[];
  source: { kind: 'text' | 'url' | 'image'; preview: string };
  attribution?: { sources: Array<{ url: string; title?: string }> } | null;
  parseId?: string;
};

export async function parseWorkout(input: {
  text?: string;
  url?: string;
  imageFile?: File;
  imageUrl?: string;
}): Promise<ParseResponse> {
  const requestId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const textLooksLikeUrl = /^https?:\/\//i.test(input.text?.trim() ?? '');
  console.info('[api] parseWorkout start', {
    requestId,
    hasFile: !!input.imageFile,
    hasImageUrl: !!input.imageUrl,
    hasText: !!input.text,
    hasUrl: !!input.url,
    textLooksLikeUrl,
  });

  if (input.imageFile) {
    const form = new FormData();
    form.set('image', input.imageFile);
    if (input.text) form.set('text', input.text);
    if (input.url) form.set('url', input.url);
    const res = await fetchWithRetries('/api/parse', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { 'x-request-id': requestId },
    });
    if (!res.ok) {
      const err = await readApiError(res);
      err.requestId = requestId;
      console.error('[api] parseWorkout failed', {
        requestId,
        status: err.status,
        code: err.code,
        raw: err.raw,
      });
      throw err;
    }
    const json = (await res.json()) as any;
    const parseId = typeof json?.parseId === 'string' ? json.parseId : undefined;
    return {
      ...json,
      parseId,
      workoutDefinition: WorkoutDefinitionSchema.parse(json.workoutDefinition),
      timerPlan: TimerPlanSchema.parse(json.timerPlan),
    } as ParseResponse;
  }

  const res = await fetchWithRetries('/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    credentials: 'include',
    body: JSON.stringify({ text: input.text, url: input.url, imageUrl: input.imageUrl }),
  });
  if (!res.ok) {
    const err = await readApiError(res);
    err.requestId = requestId;
    console.error('[api] parseWorkout failed', {
      requestId,
      status: err.status,
      code: err.code,
      raw: err.raw,
    });
    throw err;
  }
  const json = (await res.json()) as any;
  const parseId = typeof json?.parseId === 'string' ? json.parseId : undefined;
  return {
    ...json,
    parseId,
    workoutDefinition: WorkoutDefinitionSchema.parse(json.workoutDefinition),
    timerPlan: TimerPlanSchema.parse(json.timerPlan),
  } as ParseResponse;
}

export type CreateRunResponse = { runId: string; snapshot: any };

export async function createRun(
  timerPlan: unknown,
  opts?: { definitionId?: string },
): Promise<CreateRunResponse> {
  const plan = TimerPlanSchema.parse(timerPlan);
  const idempotencyKey = createIdempotencyKey();
  const res = await fetchWithRetries(
    '/api/runs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ timerPlan: plan, definitionId: opts?.definitionId }),
    },
    { idempotencyKey, maxAttempts: 5 },
  );
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as CreateRunResponse;
}

export async function createDefinition(input: {
  workoutDefinition: WorkoutDefinition;
  source?: { kind?: string; preview?: string };
  attribution?: { sources: Array<{ url: string; title?: string }> } | null;
  parseId?: string;
}): Promise<{ definitionId: string }> {
  const workoutDefinition = WorkoutDefinitionSchema.parse(input.workoutDefinition);
  const idempotencyKey = createIdempotencyKey();
  const res = await fetchWithRetries(
    '/api/definitions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...input, workoutDefinition }),
    },
    { idempotencyKey },
  );
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as { definitionId: string };
}

export async function submitParseFeedback(input: {
  parseId?: string;
  definitionId?: string;
  category?: string;
  note?: string;
  currentWorkoutDefinition?: WorkoutDefinition;
  currentTimerPlan?: TimerPlan;
  pageUrl?: string;
  userAgent?: string;
}): Promise<{ feedbackId: string; parseId?: string; definitionId?: string }> {
  const res = await fetchWithRetries('/api/parse-feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as { feedbackId: string; parseId?: string; definitionId?: string };
}

export async function patchDefinitionWorkoutDefinition(
  definitionId: string,
  workoutDefinition: WorkoutDefinition,
): Promise<{ definitionId: string }> {
  const parsed = WorkoutDefinitionSchema.parse(workoutDefinition);
  const idempotencyKey = createIdempotencyKey();
  const res = await fetchWithRetries(
    `/api/definitions/${encodeURIComponent(definitionId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ workoutDefinition: parsed }),
    },
    { idempotencyKey },
  );
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as { definitionId: string };
}

export async function copyDefinition(definitionId: string): Promise<{ definitionId: string }> {
  const idempotencyKey = createIdempotencyKey();
  const res = await fetchWithRetries(
    `/api/definitions/${encodeURIComponent(definitionId)}/copy`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    },
    { idempotencyKey },
  );
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as { definitionId: string };
}

export type DefinitionListItem = {
  definitionId: string;
  title: string | null;
  source: { kind: string | null; preview: string | null };
  lastRunId: string | null;
  lastRunAt: number | null;
};

export type ListDefinitionsResponse = {
  items: DefinitionListItem[];
  nextCursor: string | null;
};

export async function listDefinitions(
  opts: { cursor?: string; take?: number } = {},
): Promise<ListDefinitionsResponse> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (typeof opts.take === 'number') params.set('take', String(opts.take));
  const url = params.toString() ? `/api/definitions?${params.toString()}` : '/api/definitions';
  const res = await fetchWithRetries(url, { credentials: 'include' });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as ListDefinitionsResponse;
}

export async function getDefinition(definitionId: string): Promise<any> {
  const res = await fetchWithRetries(`/api/definitions/${encodeURIComponent(definitionId)}`, {
    credentials: 'include',
  });
  if (!res.ok) await throwApiError(res);
  const json = (await res.json()) as any;
  if (json?.workoutDefinition)
    json.workoutDefinition = WorkoutDefinitionSchema.parse(json.workoutDefinition);
  if (json?.timerPlan) json.timerPlan = TimerPlanSchema.parse(json.timerPlan);
  return json;
}

export async function getDefinitionDebug(definitionId: string): Promise<any> {
  const res = await fetchWithRetries(`/api/definitions/${encodeURIComponent(definitionId)}/debug`, {
    credentials: 'include',
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as any;
}

export async function getRunSnapshot(runId: string): Promise<any> {
  const res = await fetchWithRetries(`/api/runs/${encodeURIComponent(runId)}`, {
    credentials: 'include',
  });
  if (!res.ok) await throwApiError(res);
  const json = (await res.json()) as any;
  if (json?.timerPlan) json.timerPlan = TimerPlanSchema.parse(json.timerPlan);
  if (Array.isArray(json?.events))
    json.events = RunEventSchema.array().parse(json.events) as RunEvent[];
  if (json?.derived) json.derived = DerivedRunStateSchema.parse(json.derived) as DerivedRunState;
  return json;
}

export async function getRunAccess(runId: string): Promise<{ canControl: boolean }> {
  const res = await fetchWithRetries(`/api/runs/${encodeURIComponent(runId)}/access`, {
    credentials: 'include',
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as { canControl: boolean };
}

export async function updateRunSettings(
  runId: string,
  input: { timeScale?: number },
): Promise<any> {
  const res = await fetchWithRetries(`/api/runs/${encodeURIComponent(runId)}/settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!res.ok) await throwApiError(res);
  return await res.json();
}

export async function postRunEvent(runId: string, event: Record<string, unknown>): Promise<any> {
  const res = await fetchWithRetries(`/api/runs/${encodeURIComponent(runId)}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(event),
  });
  if (!res.ok) await throwApiError(res);
  return await res.json();
}
