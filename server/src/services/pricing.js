import { readTable } from '../db.js';

export function applyPricing(costPrice) {
  const settings = readTable('settings');
  const getSetting = (key, defaultVal) => {
    const s = settings.find(item => item.key === key);
    return s ? s.value : defaultVal;
  };

  const multiplier = parseFloat(getSetting('price_multiplier', '1.8'));
  const fixedAdd = parseFloat(getSetting('price_fixed_add', '5'));

  const cost_price = Math.round(costPrice * 100) / 100;
  const selling_price = Math.round((cost_price * multiplier + fixedAdd) * 100) / 100;
  const profit_margin = selling_price > 0
    ? Math.round((1 - cost_price / selling_price) * 10000) / 100
    : 0;

  return { cost_price, selling_price, profit_margin };
}
