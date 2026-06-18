import { chromium } from "playwright";
import { join, resolve } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";

// Same code as the batcher function
const PROJECT_ROOT = resolve(import.meta.url.replace("file:///", ""), "..", "..", "..");
console.log("PROJECT_ROOT:", PROJECT_ROOT);
export const test = 1;
