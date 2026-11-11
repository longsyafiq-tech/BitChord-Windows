import { BridgeCallError, isBridgeResponse, type Bridge, type BridgeEvent, type BridgeRequest, type BridgeResponse, type DetectedExtension, type ResultOf } from '@bitchord/shared/bridge';

interface DesktopApi {
  version: string;
  request(message: BridgeRequest): Promise<BridgeResponse>;
  subscribe(listener: (event: BridgeEvent) => void): () => void;
}
declare global { interface Window { bitchordDesktop?: DesktopApi } }
export const isDesktop = typeof window !== 'undefined' && !!window.bitchordDesktop;
export const desktopVersion = typeof window !== 'undefined' ? window.bitchordDesktop?.version : undefined;

/** A typed, narrow service connection; credentials remain in the main process. */
export async function detectDesktop(): Promise<DetectedExtension | null> {
  const api = window.bitchordDesktop;
  if (!api) return null;
  const bridge: Bridge = {
    transport: 'external',
    call(method, params, options) {
      const id = crypto.randomUUID();
      const request = { channel: 'bitchord-bridge', protocol: 1, direction: 'to-extension', id, method, params } as BridgeRequest;
      return new Promise((resolve, reject) => {
        const abort = () => finish(undefined, options?.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        let done = false;
        const timer = setTimeout(() => finish(undefined, new BridgeCallError('timeout', 'The music service did not respond in time.')), options?.timeoutMs ?? 30_000);
        const finish = (value?: ResultOf<typeof method>, error?: unknown) => {
          if (done) return;
          done = true; clearTimeout(timer); options?.signal?.removeEventListener('abort', abort);
          if (error) reject(error); else resolve(value as ResultOf<typeof method>);
        };
        if (options?.signal?.aborted) { abort(); return; }
        options?.signal?.addEventListener('abort', abort, { once: true });
        api.request(request).then(response => {
          if (!isBridgeResponse(response) || response.id !== id) throw new BridgeCallError('protocol', 'Invalid desktop service response.');
          if (!response.ok) throw new BridgeCallError(response.error.code, response.error.message);
          finish(response.result as ResultOf<typeof method>);
        }).catch(error => finish(undefined, error));
      });
    },
    subscribe: listener => api.subscribe(listener),
  };
  return { bridge, info: await bridge.call('ping', {}) };
}
