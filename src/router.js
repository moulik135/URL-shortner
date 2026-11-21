export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, key) => (keys.push(key), '([^/]+)'));
    routes.push({ method, re: new RegExp(`^${source}$`), keys, handler });
  };

  function match(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      try {
        return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      } catch {
        return null; // malformed %-encoding
      }
    }
    return null;
  }

  return { get: add('GET'), post: add('POST'), delete: add('DELETE'), match };
}
