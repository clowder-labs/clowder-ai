import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer';
import type { XinshengConfig } from './config.js';
import { buildSearchUrl, normalizeQuery } from './config.js';
import { detectSearchState, type SearchPageSnapshot, type SearchPageState, type XinshengSearchResult } from './search.js';

const POLL_INTERVAL_MS = 500;

export interface PrepareSessionOptions {
  query?: string;
  visible?: boolean;
  timeoutMs?: number;
}

export interface PrepareSessionResult {
  ready: boolean;
  state: SearchPageState;
  currentUrl: string;
  profileDir: string;
  browserExecutablePath: string;
  message: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  visible?: boolean;
  timeoutMs?: number;
}

export interface SearchResultPayload {
  state: SearchPageState;
  query: string;
  pageUrl: string;
  results: XinshengSearchResult[];
}

export class XinshengBrowserSession {
  private browser: Browser | null = null;
  private visibleMode = false;

  constructor(private readonly config: XinshengConfig) {}

  async prepareSession(options: PrepareSessionOptions = {}): Promise<PrepareSessionResult> {
    const visible = options.visible ?? true;
    const query = normalizeQuery(options.query || '华为');
    const page = await this.openPage(visible);
    await this.navigate(page, buildSearchUrl(this.config.searchPageUrl, query));

    const snapshot = await this.waitForStableState(page, options.timeoutMs ?? this.config.searchTimeoutMs);
    const state = detectSearchState(snapshot);
    const ready = state !== 'login_required';
    const message = ready
      ? '当前浏览器 session 已可用于搜索，后续会复用同一份 profile。'
      : '浏览器已打开到心声搜索页。请在该窗口完成登录，登录成功后再次调用 xinsheng_search。';

    return {
      ready,
      state,
      currentUrl: snapshot.url,
      profileDir: this.config.profileDir,
      browserExecutablePath: this.config.browserExecutablePath,
      message,
    };
  }

  async search(options: SearchOptions): Promise<SearchResultPayload> {
    const query = normalizeQuery(options.query);
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
    const visible = options.visible ?? this.config.defaultVisible;
    const page = await this.openPage(visible);

    try {
      await this.navigate(page, buildSearchUrl(this.config.searchPageUrl, query));
      const snapshot = await this.waitForStableState(page, options.timeoutMs ?? this.config.searchTimeoutMs);
      return {
        state: detectSearchState(snapshot),
        query,
        pageUrl: snapshot.url,
        results: snapshot.results.slice(0, limit),
      };
    } finally {
      if (!visible) {
        await page.close().catch(() => undefined);
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  private async openPage(visible: boolean): Promise<Page> {
    const browser = await this.ensureBrowser(visible);
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1024 });
    return page;
  }

  private async ensureBrowser(visible: boolean): Promise<Browser> {
    if (this.browser && this.visibleMode === visible) {
      return this.browser;
    }

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }

    this.browser = await puppeteer.launch({
      headless: !visible,
      executablePath: this.config.browserExecutablePath,
      userDataDir: this.config.profileDir,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: null,
    });
    this.visibleMode = visible;
    return this.browser;
  }

  private async navigate(page: Page, url: string): Promise<void> {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: this.config.navigationTimeoutMs,
    });
  }

  private async waitForStableState(page: Page, timeoutMs: number): Promise<SearchPageSnapshot> {
    const deadline = Date.now() + timeoutMs;
    let lastSnapshot = await this.readSnapshot(page);
    let lastState = detectSearchState(lastSnapshot);

    while (Date.now() < deadline) {
      if (lastState !== 'unknown') {
        return lastSnapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      lastSnapshot = await this.readSnapshot(page);
      lastState = detectSearchState(lastSnapshot);
    }

    return lastSnapshot;
  }

  private async readSnapshot(page: Page): Promise<SearchPageSnapshot> {
    return page.evaluate(() => {
      const normalizeText = (value: string | null | undefined): string =>
        (value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

      const results = Array.from(document.querySelectorAll<HTMLElement>('.search-post-card'))
        .map((card, index) => {
          const title = normalizeText(card.querySelector('.title')?.textContent);
          const abstract = normalizeText(card.querySelector('p.abstract')?.textContent);
          const author = normalizeText(card.querySelector('.desc1')?.textContent);
          const meta = normalizeText(
            Array.from(card.querySelectorAll<HTMLElement>('p.desc span'))
              .map((node) => node.textContent)
              .join(' | '),
          );
          const href =
            Array.from(card.querySelectorAll<HTMLAnchorElement>('a'))
              .map((node) => node.href)
              .find((value) => value && value !== 'javascript:void(0);') || undefined;

          return {
            position: index + 1,
            postId: card.getAttribute('data-id') || undefined,
            title,
            abstract,
            href,
            author,
            meta,
          };
        })
        .filter((item) => item.title || item.abstract);

      return {
        url: window.location.href,
        title: document.title,
        bodyText: normalizeText(document.body?.innerText),
        results,
      };
    });
  }
}
