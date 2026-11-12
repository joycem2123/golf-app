/**
 * Keep a JavaScript error from closing the app, and note what went wrong (in the anonymous usage log)
 * so it can be fixed. Only the error's message and where it came from are kept — never names or scores.
 */
import { flush, track } from '@/lib/usage';

type Handler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): Handler;
  setGlobalHandler(h: Handler): void;
}

const MAX_PROPS = 280; // the usage log keeps at most 300 bytes of details per event
let last = { msg: '', at: 0 };

/** Record an error: a short message and the first useful line of where it happened. */
export function reportError(kind: 'render' | 'fatal' | 'error', error: unknown, where?: string) {
  const e = error instanceof Error ? error : new Error(String(error));
  const at = (where ?? e.stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith(e.name) && !l.startsWith('Error'));
  const props = { kind, msg: `${e.name}: ${e.message}`.slice(0, 160), at: (at ?? '').slice(0, 80) };
  // Never let an over-long entry block the rest of the usage log from sending.
  while (JSON.stringify(props).length > MAX_PROPS) props.msg = props.msg.slice(0, -10);
  // React retries a failing screen a few times: note each distinct error once.
  const now = Date.now();
  if (props.msg === last.msg && now - last.at < 10_000) return;
  last = { msg: props.msg, at: now };
  track('app_error', props);
  void flush();
}

let installed = false;
/** Errors thrown outside a screen (in a button press, a timer, a sync callback) would otherwise close the app. */
export function installCrashGuard() {
  const EU = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !EU) return;
  installed = true;
  const original = EU.getGlobalHandler();
  EU.setGlobalHandler((error, isFatal) => {
    try {
      reportError(isFatal ? 'fatal' : 'error', error);
    } catch {
      /* reporting must never make things worse */
    }
    // In development keep the red error screen; in the real app, stay open.
    if (__DEV__) original(error, isFatal);
    else if (!isFatal) original(error, isFatal);
  });
}
