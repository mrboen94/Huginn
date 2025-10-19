import { readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { chromium } from 'playwright-core';
import { createRequire } from 'module';

interface CodeScreenshotArgs {
    code: string;
    language?: string;
    transparent?: boolean;
    highlight?: string;
    scale?: number;
    titleOverride?: string;
}

function parseHighlightRanges(ranges: string | undefined, maxLines = 10000): Set<number> {
    const highlighted = new Set<number>();

    if (!ranges?.trim()) return highlighted;

    const tokens = ranges.split(',').map(s => s.trim()).filter(Boolean);

    for (const token of tokens) {
        if (token.includes('-')) {
            const parts = token.split('-');
            if (parts.length >= 2 && parts[0] && parts[1]) {
                const start = parseInt(parts[0].trim(), 10);
                const end = parseInt(parts[1].trim(), 10);
                if (isFinite(start) && isFinite(end) && start > 0 && end > 0) {
                    const min = Math.min(start, end);
                    const max = Math.min(Math.max(start, end), maxLines);
                    for (let i = min; i <= max; i++) {
                        highlighted.add(i);
                    }
                }
            }
        } else {
            const line = parseInt(token, 10);
            if (isFinite(line) && line > 0) {
                highlighted.add(line);
            }
        }
    }

    return highlighted;
}

// Sanitize HTML strings to prevent injection
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

async function getIosevkaFontCSS(): Promise<{ css: string; fallback: boolean }> {
    try {
        const require = createRequire(import.meta.url);
        let fontPath: string;

        try {
            fontPath = require.resolve('@fontsource/iosevka/files/iosevka-latin-400-normal.woff2');
        } catch {
            fontPath = join(process.cwd(), 'node_modules', '@fontsource', 'iosevka', 'files', 'iosevka-latin-400-normal.woff2');
        }

        const fontBuffer = await readFile(fontPath);
        const base64Font = fontBuffer.toString('base64');

        const css = `
@font-face {
    font-family: 'Iosevka';
    font-weight: 400;
    font-style: normal;
    font-display: swap;
    src: url(data:font/woff2;base64,${base64Font}) format('woff2');
}`;

        return { css, fallback: false };
    } catch {
        return {
            css: '',
            fallback: true
        };
    }
}

async function generateHTML(
    code: string,
    language: string,
    highlighted: Set<number>,
    transparent: boolean,
    title: string
): Promise<{ html: string; usedFallback: boolean }> {
    const { codeToHtml } = await import('shiki');

    let shikiHtml: string;

    try {
        shikiHtml = await codeToHtml(code, {
            lang: language,
            theme: 'dracula'
        });
    } catch {
        shikiHtml = await codeToHtml(code, {
            lang: 'plaintext',
            theme: 'dracula'
        });
    }

    if (highlighted.size > 0) {
        const lines = shikiHtml.split('\n');
        const processedLines = lines.map((line, index) => {
            const lineNumber = index + 1;
            if (highlighted.has(lineNumber) && line.includes('<span class="line">')) {
                return line.replace('<span class="line">', '<span class="line highlighted">');
            }
            return line;
        });
        shikiHtml = processedLines.join('\n');
    }

    const { css: fontCSS, fallback: fontFallback } = await getIosevkaFontCSS();

    const fontFamily = fontFallback ?
        `'Monaco', 'Menlo', 'Ubuntu Mono', monospace` :
        `'Iosevka', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace`;

    const safetitle = escapeHtml(title);

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Code Screenshot</title>
    ${fontCSS}
    <style>
        :root {
            --dracula-bg: #282a36;
            --dracula-current-line: #44475a;
            --dracula-fg: #f8f8f2;
            --dracula-comment: #6272a4;
            --dracula-cyan: #8be9fd;
            --dracula-green: #50fa7b;
            --dracula-orange: #ffb86c;
            --dracula-pink: #ff79c6;
            --dracula-purple: #bd93f9;
            --dracula-red: #ff5555;
            --dracula-yellow: #f1fa8c;
        }
        
        * {
            box-sizing: border-box;
        }
        
        html, body { width: max-content; }
        body {
            margin: 0;
            padding: 20px;
            font-family: ${fontFamily};
            background: ${transparent ? 'transparent' : 'var(--dracula-bg)'};
            display: flex;
            justify-content: flex-start;
            align-items: flex-start;
        }
        
        .window {
            background: ${transparent ? 'rgba(40, 42, 54, 0.92)' : 'var(--dracula-bg)'};
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35), 0 8px 16px rgba(0, 0, 0, 0.25); /* keep shadow even when transparent */
            filter: ${transparent ? 'drop-shadow(0 12px 32px rgba(0,0,0,0.45))' : 'none'};
            overflow: hidden; /* ensure rounded corners apply to children */
            width: max-content; /* expand to content width */
            max-width: none; /* allow very wide code */
            min-width: 400px;
            backdrop-filter: blur(10px);
            margin: ${transparent ? '12px' : '0'}; /* subtle spacing on transparent */
        }
        
        .header {
            background: ${transparent ? 'rgba(68, 71, 90, 0.8)' : 'var(--dracula-current-line)'};
            padding: 10px 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid rgba(98, 114, 164, 0.3);
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
        }
        
        .traffic-lights {
            display: flex;
            gap: 6px;
            margin-right: 12px;
        }
        
        .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }
        
        .dot.red { background: #ff5f57; }
        .dot.yellow { background: #febc2e; }
        .dot.green { background: #28c840; }
        
        .title {
            color: var(--dracula-fg);
            font-size: 12px; /* smaller title */
            font-weight: 500;
            opacity: 0.85;
        }
        
        .code-container {
            position: relative;
            overflow: hidden; /* clip to rounded corners while container grows to content width */
            padding-left: 16px; /* extra left breathing room without affecting highlight bar */
            border-bottom-left-radius: 12px;
            border-bottom-right-radius: 12px;
        }
        
        .code-container::-webkit-scrollbar {
            height: 8px;
            background: transparent;
        }
        
        .code-container::-webkit-scrollbar-thumb {
            background: var(--dracula-comment);
            border-radius: 4px;
        }
        
        pre {
            margin: 0;
            padding: 20px 20px 20px 60px;
            font-family: ${fontFamily};
            font-size: 14px;
            line-height: 18px; /* fixed line height */
            white-space: normal; /* prevent double line breaks from newline text nodes */
            overflow: visible;
            counter-reset: line-number;
            font-variant-ligatures: common-ligatures;
            font-feature-settings: "liga" 1, "calt" 1;
            tab-size: 2;
        }
        
        .shiki, .shiki code { line-height: 18px; white-space: normal; }
        .shiki span { line-height: inherit; }
        
        .line {
            display: block;
            position: relative;
            counter-increment: line-number;
            margin: 0;
            padding: 0;
            line-height: 18px; /* lock per-line height */
            min-height: 18px;
            white-space: pre; /* preserve leading spaces/tabs */
            text-indent: 4px; /* shift text so left highlight bar doesn't overlay first glyph */
        }
        
        .line::before {
            content: counter(line-number);
            position: absolute;
            left: -45px;
            width: 35px;
            text-align: right;
            color: var(--dracula-comment);
            font-size: 12px;
            line-height: inherit;
            user-select: none;
        }
        
        .shiki {
            background: transparent !important;
        }
        .shiki code { display: block; }
        
        .line.highlighted {
            background: rgba(189, 147, 249, 0.10);
            box-shadow: inset 3px 0 0 0 var(--dracula-purple);
        }
        
        .line.highlighted::before {
            left: -45px;
        }
    </style>
</head>
<body>
    <div class="window" id="capture">
        <div class="header">
            <div class="traffic-lights">
                <div class="dot red"></div>
                <div class="dot yellow"></div>
                <div class="dot green"></div>
            </div>
            <div class="title">${safetitle}</div>
        </div>
        <div class="code-container">
            ${shikiHtml}
        </div>
    </div>
</body>
</html>`;

    return { html, usedFallback: fontFallback };
}

// Generate timestamp for filename
function generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}${month}${day}_${hours}${minutes}${seconds}${ms}`;
}

export const codeScreenshotTool = {
    name: 'code_screenshot',
    description: 'Render a styled PNG screenshot from a code string (Dracula theme, Iosevka font, macOS style, line numbers, highlight ranges)',
    inputSchema: {
        type: 'object',
        properties: {
            code: {
                type: 'string',
                description: 'Code string to render'
            },
            language: {
                type: 'string',
                description: 'Programming language for syntax highlighting',
                default: 'plaintext'
            },
            transparent: {
                type: 'boolean',
                description: 'Use transparent background',
                default: false
            },
            highlight: {
                type: 'string',
                description: 'Highlight line ranges (e.g., "3,5-7,10")'
            },
            scale: {
                type: 'number',
                description: 'Device scale factor for higher DPI',
                default: 2
            },
            titleOverride: {
                type: 'string',
                description: 'Custom window title (defaults to language name)'
            }
        },
        required: ['code'],
        additionalProperties: false
    },

    handler: async (
        args: Record<string, unknown>,
        signal: AbortSignal
    ) => {
        const {
            code,
            language = 'plaintext',
            transparent = false,
            highlight,
            scale = 2,
            titleOverride
        } = args as unknown as CodeScreenshotArgs;

        if (!code || typeof code !== 'string') {
            throw new Error('Argument "code" must be a non-empty string');
        }

        if (signal.aborted) {
            throw new Error('Aborted');
        }

        const codeLines = code.split('\n');
        const highlighted = parseHighlightRanges(highlight, codeLines.length);

        const title = titleOverride || (language === 'plaintext' ? 'Code' : language.toUpperCase());

        const { html, usedFallback } = await generateHTML(
            code,
            language,
            highlighted,
            transparent,
            title
        );

        if (signal.aborted) {
            throw new Error('Aborted');
        }

        // Setup output directory and filename
        const outputDir = join(process.cwd(), 'out', 'code_screenshot');
        await mkdir(outputDir, { recursive: true });

        const timestamp = generateTimestamp();
        const filename = `Huginn_${timestamp}.png`;
        const outputPath = join(outputDir, filename);

        // Render with Playwright
        let browser: import('playwright-core').Browser | undefined;
        try {
            browser = await chromium.launch();
            const context = await browser.newContext({
                deviceScaleFactor: scale
            });
            const page = await context.newPage();

            if (signal.aborted) {
                throw new Error('Aborted');
            }

            await page.setContent(html, { waitUntil: 'load' });

            // Reset any horizontal scroll that might cause left-side clipping
            await page.evaluate(() => {
                window.scrollTo(0, 0);
                (document.scrollingElement || document.documentElement).scrollLeft = 0;
                document.documentElement.scrollLeft = 0;
                document.body.scrollLeft = 0;
                const cap = document.getElementById('capture');
                if (cap) (cap as HTMLElement).scrollLeft = 0;
            });

            // Resize viewport to fit full content width/height to prevent clipping
            const { width, height } = await page.evaluate(() => {
                const el = document.getElementById('capture');
                if (!el) return { width: 800, height: 600 };
                const w = Math.ceil((el as HTMLElement).scrollWidth);
                const h = Math.ceil((el as HTMLElement).scrollHeight);
                return { width: w, height: h };
            });
            const maxDim = 15000; // safety clamp
            await page.setViewportSize({
                width: Math.min(Math.max(width, 800), maxDim),
                height: Math.min(Math.max(height, 600), maxDim)
            });

            if (signal.aborted) {
                throw new Error('Aborted');
            }

            await page.evaluate(() => {
                const d = document as unknown as { fonts?: { ready: Promise<void> } };
                return d.fonts ? d.fonts.ready : Promise.resolve();
            });

            const captureElement = await page.$('#capture');
            if (!captureElement) {
                throw new Error('Capture element not found');
            }

            await captureElement.screenshot({
                path: outputPath,
                omitBackground: transparent
            });

            let message = `PNG code screenshot generated: ${outputPath}`;
            if (usedFallback) {
                message += ' (using system monospace font - Iosevka not available)';
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: message
                    }
                ]
            };
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeErr) {
                    void closeErr;
                }
            }
        }
    }
};

export const tools = [codeScreenshotTool];
export default codeScreenshotTool;

export const requiredPackages = {
    'shiki': '^1.0.0',
    '@fontsource/iosevka': '^5.0.0'
};
