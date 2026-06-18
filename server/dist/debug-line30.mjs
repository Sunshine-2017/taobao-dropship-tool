/**
 * Taobao auto-listing service via Playwright
 *
 * KEY BREAKTHROUGH (2026-06-13):
 *   Image upload works via the iframe-based file selector (sucai-selector-ng),
 *   NOT through the main page DOM. See uploadImagesViaIframe().
 *
 * Architecture:
 * - launchContext(): persistent browser context with saved login
 * - searchAndSelectCategory(): find and select product category
 * - fillForm(): fill title, price, stock on publish page
 * - uploadImagesViaIframe(): upload product images via iframe dialog
 * - submitAndVerify(): click submit and check success
 * - batchListToTaobao(): orchestrates the full flow
 */
import { chromium } from 'playwright';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

// Use absolute paths to avoid cwd issues
const PROJECT_ROOT = resolve(join(import.meta.url.replace('file:///', ''), '..', '..', '..'));
const USER_DATA_DIR = process.env.TAOBAO_PROFILE_DIR || join(PROJECT_ROOT, 'data', 'taobao-profile');
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'data', 'screenshots');
const LOG_DIR = join(PROJECT_ROOT, 'data', 'logs');

// Helper: wrap a promise with a timeout
function withTimeout(promise, ms, label = '操作') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}超时 (${ms / 1000}s)`)), ms)),
export const x = 1;
