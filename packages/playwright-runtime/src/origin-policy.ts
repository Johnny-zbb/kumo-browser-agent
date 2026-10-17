/** Exact, user-supplied origins only. No wildcard, path prefix or user-info. */
export class OriginPolicy {
  private readonly origins: ReadonlySet<string>;

  constructor(allowedOrigins: readonly string[]) {
    if (!allowedOrigins.length) throw new Error('allowed_origins_required');
    const origins = new Set<string>();
    for (const raw of allowedOrigins) {
      const url = this.parse(raw);
      if (url.pathname !== '/' || url.search || url.hash || raw !== url.origin && raw !== `${url.origin}/`) {
        throw new Error('allowed_origin_must_be_exact');
      }
      origins.add(url.origin);
    }
    this.origins = origins;
  }

  private parse(value: string): URL {
    let url: URL;
    try { url = new URL(value); }
    catch { throw new Error('invalid_browser_url'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid_browser_url');
    return url;
  }

  allows(url: string): boolean {
    try { return this.origins.has(this.parse(url).origin); }
    catch { return false; }
  }

  assertAllowed(url: string): void {
    if (!this.allows(url)) throw new Error('origin_not_allowed');
  }
}
