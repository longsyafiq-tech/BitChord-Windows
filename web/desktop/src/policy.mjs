export const APP_ORIGIN = 'bitchord://app';

export function isAppUrl(value) {
  try { const u = new URL(value); return u.protocol === 'bitchord:' && u.hostname === 'app' && !u.port && !u.username && !u.password; }
  catch { return false; }
}

export function isHttps(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443'); }
  catch { return false; }
}

export function isAuthUrl(value) {
  if (!isHttps(value)) return false;
  return ['accounts.google.com', 'myaccount.google.com', 'consent.google.com', 'consent.youtube.com',
    'youtube.com', 'www.youtube.com', 'music.youtube.com', 'accounts.spotify.com', 'open.spotify.com',
    'discord.com'].includes(new URL(value).hostname);
}

/** The small DNR subset used by upstream. A domain anchor must match a complete label. */
export function matchesRule(rule, value) {
  if (!isHttps(value)) return false;
  const filter = rule.condition?.urlFilter;
  if (!filter?.startsWith('||')) return false;
  const [host, ...parts] = filter.slice(2).split('/');
  const u = new URL(value);
  if (!(u.hostname === host || u.hostname.endsWith(`.${host}`))) return false;
  const pattern = '/' + parts.join('/');
  const escaped = pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + escaped).test(u.pathname + u.search);
}

export function applyHeaders(original, modifications) {
  const out = { ...original };
  for (const h of modifications ?? []) {
    for (const key of Object.keys(out)) if (key.toLowerCase() === h.header.toLowerCase()) delete out[key];
    if (h.operation === 'set') out[h.header] = h.value;
  }
  return out;
}

export function ruleHeaders(rules, url, original, kind) {
  let headers = { ...original };
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (matchesRule(r, url)) headers = applyHeaders(headers, r.action?.[kind]);
  }
  return headers;
}

export function validateRequest(message) {
  if (!message || typeof message !== 'object' || message.channel !== 'bitchord-bridge' ||
      message.direction !== 'to-extension' || typeof message.id !== 'string' || message.id.length > 100 ||
      typeof message.method !== 'string' || !message.params || typeof message.params !== 'object' ||
      Array.isArray(message.params)) return false;
  if (JSON.stringify(message).length > 2 * 1024 * 1024) return false;
  if (message.method.endsWith('.fetch')) {
    const p = message.params;
    if (!isHttps(p.url) || (p.method && !['GET', 'POST', 'HEAD'].includes(p.method))) return false;
    if (p.body !== undefined && typeof p.body !== 'string') return false;
    if (p.headers !== undefined && (!p.headers || typeof p.headers !== 'object' || Array.isArray(p.headers))) return false;
    for (const [key, value] of Object.entries(p.headers ?? {})) {
      if (typeof value !== 'string' || /[\r\n]/.test(key + value) || /^(cookie|authorization|host|proxy-.*)$/i.test(key)) return false;
    }
  }
  return true;
}

export function assetPath(root, url, path) {
  if (!isAppUrl(url)) return null;
  let pathname;
  try { pathname = decodeURIComponent(new URL(url).pathname); } catch { return null; }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) return null;
  const candidate = path.resolve(root, '.' + pathname);
  return candidate === root || candidate.startsWith(root + path.sep) ? candidate : null;
}
