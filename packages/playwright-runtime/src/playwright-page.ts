import type { Page, Route, Frame } from 'playwright';
import type { PageAction, PagePort, PageSnapshot } from '../../agent-core/src/types.js';
import { OriginPolicy } from './origin-policy.js';

interface BrowserDriver {
  observe(selector: string): Promise<PageSnapshot>;
  execute(selector: string, action: PageAction): Promise<void>;
  settle(selector: string): Promise<void>;
}

export interface PlaywrightPageOptions {
  /** Explicit exact HTTP(S) origins, e.g. http://127.0.0.1:4173. */
  allowedOrigins: readonly string[];
  /** Authorized DOM subtree; defaults to the whole document body. */
  rootSelector?: string;
  /** Generated dist/browser-dom-driver.js, supplied by the Node caller. */
  driverSource: string;
  /** Used only for isolated tests that intentionally setContent on about:blank. */
  testAllowInitialBlank?: boolean;
}

/**
 * Node-only Playwright PagePort. Browser-side semantics and refs are provided by
 * the compiled DOM Engine, not duplicated here. A dedicated context is required.
 */
export class PlaywrightPagePort implements PagePort {
  readonly policy: OriginPolicy;
  private readonly rootSelector: string;
  private readonly driverSource: string;
  private readonly testAllowInitialBlank: boolean;
  private started = false;
  private disposed = false;
  private documentEpoch = 0;
  private sequence = 0;
  private last: { id: number; epoch: number; url: string } | null = null;

  constructor(readonly page: Page, options: PlaywrightPageOptions) {
    this.policy = new OriginPolicy(options.allowedOrigins);
    this.rootSelector = options.rootSelector ?? 'body';
    if (!this.rootSelector.trim()) throw new Error('authorized_root_required');
    this.driverSource = options.driverSource;
    if (!this.driverSource.includes('__kumoBrowserDriver')) throw new Error('driver_source_invalid');
    this.testAllowInitialBlank = options.testAllowInitialBlank === true;
  }

  private readonly onNavigation = (frame: Frame): void => {
    if (frame === this.page.mainFrame()) { this.documentEpoch++; this.last = null; }
  };

  private readonly route = async (route: Route): Promise<void> => {
    // Fail closed for every intercepted request, not just the top-level URL.
    if (!this.policy.allows(route.request().url())) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  };

  async start(): Promise<void> {
    if (this.disposed) throw new Error('browser_port_disposed');
    if (this.started) return;
    const current = this.page.url();
    if (current !== 'about:blank') this.policy.assertAllowed(current);
    await this.page.context().route('**/*', this.route);
    this.page.on('framenavigated', this.onNavigation);
    this.started = true;
  }

  async navigate(target: string): Promise<void> {
    if (this.disposed || !this.started) throw new Error('browser_port_not_started');
    // A newly-created Playwright page starts at about:blank. Allow ONLY the
    // first explicitly approved navigation from that bootstrap document.
    if (this.page.url() !== 'about:blank') this.policy.assertAllowed(this.page.url());
    this.policy.assertAllowed(target);
    this.last = null;
    await this.page.goto(target, { waitUntil: 'domcontentloaded' });
    this.policy.assertAllowed(this.page.url());
  }

  private ready(): void {
    if (this.disposed || !this.started) throw new Error('browser_port_not_started');
    const url = this.page.url();
    if (!(this.testAllowInitialBlank && url === 'about:blank')) this.policy.assertAllowed(url);
  }

  private async driver(): Promise<void> {
    // Evaluate in the page's execution context, including when CSP forbids
    // ordinary module imports. The isolated/browser context is not a trust boundary.
    const present = await this.page.evaluate(() => !!(window as unknown as { __kumoBrowserDriver?: BrowserDriver }).__kumoBrowserDriver);
    if (!present) await this.page.evaluate(this.driverSource);
  }

  async observe(): Promise<PageSnapshot> {
    this.ready();
    await this.driver();
    const epoch = this.documentEpoch;
    const snapshot = await this.page.evaluate(async selector => {
      const driver = (window as unknown as { __kumoBrowserDriver: BrowserDriver }).__kumoBrowserDriver;
      return driver.observe(selector);
    }, this.rootSelector);
    if (epoch !== this.documentEpoch) throw new Error('stale_snapshot');
    this.ready();
    const id = ++this.sequence;
    this.last = { id, epoch, url: this.page.url() };
    return { ...snapshot, id };
  }

  async execute(action: PageAction, observed: PageSnapshot): Promise<void> {
    this.ready();
    if (!this.last || observed.id !== this.last.id || this.last.epoch !== this.documentEpoch || observed.url !== this.page.url()) {
      throw new Error('stale_snapshot');
    }
    await this.page.evaluate(async ({ selector, action }) => {
      const driver = (window as unknown as { __kumoBrowserDriver: BrowserDriver }).__kumoBrowserDriver;
      if (!driver) throw new Error('stale_snapshot');
      await driver.execute(selector, action);
    }, { selector: this.rootSelector, action });
  }

  async settle(): Promise<void> {
    this.ready();
    await this.page.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => {});
    await this.page.waitForTimeout(170);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.last = null;
    if (this.started) {
      this.page.off('framenavigated', this.onNavigation);
      await this.page.context().unroute('**/*', this.route);
    }
  }
}
