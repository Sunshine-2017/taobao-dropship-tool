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
export const x = 1;
