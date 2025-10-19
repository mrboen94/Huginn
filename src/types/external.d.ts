declare module 'playwright-core' {
  export interface Browser {
    newContext(options?: { deviceScaleFactor?: number }): Promise<BrowserContext>;
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface Page {
    setContent(html: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void>;
    evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
    evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
    $(selector: string): Promise<ElementHandle | null>;
    setViewportSize(size: { width: number; height: number }): Promise<void>;
    screenshot(options: { path: string; omitBackground?: boolean; fullPage?: boolean }): Promise<void>;
  }

  export interface ElementHandle {
    screenshot(options: { path: string; omitBackground?: boolean; fullPage?: boolean }): Promise<void>;
  }

  export const chromium: {
    launch(options?: Record<string, unknown>): Promise<Browser>;
  };
}

declare module 'diff2html' {
  export function html(diff: string, options?: Record<string, unknown>): string;
}

declare module 'shiki' {
  export function codeToHtml(code: string, options: { lang: string; theme: string }): Promise<string>;
}
