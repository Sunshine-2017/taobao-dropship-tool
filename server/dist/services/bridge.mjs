import { createRequire } from 'module';
const requireFn = createRequire(import.meta.url);
const mod = requireFn('./taobao-auto-list.cjs');
export const batchListToTaobao = mod.batchListToTaobao;
