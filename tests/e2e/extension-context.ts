import { chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

export type ExtensionContext = { context: BrowserContext; extensionId: string };

export async function launchExtensionContext(): Promise<ExtensionContext> {
  const extensionPath = path.resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    // Playwright's default headless shell does not load Chrome extensions.
    // The full Chromium "new headless" channel does, so automated validation
    // stays invisible while exercising the real Manifest V3 extension.
    channel: 'chromium',
    headless: process.env.MDR_HEADED !== '1',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  return { context, extensionId: new URL(worker.url()).host };
}
