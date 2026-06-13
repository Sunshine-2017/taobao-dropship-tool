import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const EXPORTS_DIR = join(process.cwd(), 'data', 'exports');

// Generate Taobao Assistant compatible CSV
// Format reference: https://open.taobao.com/docV3
export function generateTaobaoCSV(products) {
  if (!existsSync(EXPORTS_DIR)) {
    mkdirSync(EXPORTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `taobao-listings-${timestamp}.csv`;
  const filePath = join(EXPORTS_DIR, fileName);

  // Taobao Assistant CSV columns (standard format)
  const headers = [
    '宝贝名称',           // title
    '宝贝类目',           // category path
    '店铺类目',           // store category (user-defined)
    '宝贝图片',           // main image URLs (space-separated)
    '宝贝描述',           // description
    '宝贝卖点',           // selling point (short)
    '宝贝价格',           // price
    '宝贝数量',           // stock quantity
    '上传状态',           // upload status (new)
    '运费承担',           // freight payer (seller)
    '宝贝属性',           // item properties
    '商家编码',           // seller SKU code
    '销售属性组合',       // SKU combinations
    '宝贝规格',           // specs
    '付款模式',           // payment mode
    '会员打折',           // member discount
    '生效时间',           // effective time
    '间隔天数',           // interval days
    '运费模板',           // freight template name
    '宝贝重量',           // weight (kg)
    '宝贝体积',           // volume
  ];

  const rows = [headers.join('\t')]; // TSV format for Taobao Assistant

  for (const p of products) {
    let images = [];
    try { images = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch { images = []; }

    // Category: use product category, fallback to default
    const category = p.category || getDefaultCategory(p) || '';

    // Images: Taobao CSV supports multiple image URLs separated by specific delimiter
    const imageStr = images.length > 0 ? images.join('|') : '';

    // Description: combine description with basic product info
    const desc = p.description || `${p.title}，产地直发，品质保证`;

    // Price: prefer selling_price, fallback to cost_price with markup
    const price = p.selling_price || (p.cost_price ? Math.round(p.cost_price * 1.8 * 100) / 100 : 0);

    // Stock: reasonable default
    const stock = p.stock_quantity || p.stock || '9999';

    const row = [
      escapeField(p.title || ''),
      escapeField(category),
      escapeField(category),                    // store category: same as item category
      escapeField(imageStr),                     // images: space-separated URLs
      escapeField(desc),
      escapeField((p.title || '').slice(0, 40)), // selling point: first 40 chars of title
      price,
      stock,
      'new',                                     // upload as new listing
      'seller',                                  // seller pays freight
      '',                                        // item properties (optional)
      escapeField(`SKU-${p.id}`),               // seller SKU code
      '',                                        // SKU combos (no variants)
      '',                                        // specs
      '2',                                       // payment: 2=immediate payment
      '0',                                       // member discount: none
      new Date().toISOString().slice(0, 10),    // effective date: today
      '7',                                       // listing duration: 7 days
      escapeField('包邮'),                        // freight template
      '0.5',                                     // weight: 0.5kg default
      '',                                        // volume
    ];
    rows.push(row.join('\t'));
  }

  writeFileSync(filePath, '﻿' + rows.join('\n'), 'utf-8');
  return filePath;
}

function escapeField(value) {
  const str = String(value || '');
  return str.replace(/[\t\n\r]/g, ' ');
}

function getDefaultCategory(product) {
  const title = (product.title || '').toLowerCase();
  const categoryMap = [
    { keywords: ['花茶', '菊花', '玫瑰', '茉莉', '桂花', '洛神', '花草', '茶'], category: '茶>>代用/花草/水果/再加工茶>>组合型花茶' },
    { keywords: ['枸杞', '黄芪', '三七', '灵芝', '石斛', '人参', '当归', '党参', '药', '补'], category: '传统滋补品>>药食同源食品>>其他药食同源食品' },
    { keywords: ['红枣', '银耳', '燕窝', '阿胶', '鹿茸'], category: '传统滋补品>>药食同源食品>>其他药食同源食品' },
    { keywords: ['手机壳', '数据线', '充电器', '耳机'], category: '3C数码配件>>手机配件>>其他手机配件' },
    { keywords: ['收纳', '整理箱', '置物架'], category: '收纳整理>>收纳箱/盒>>其他收纳箱/盒' },
  ];
  for (const { keywords, category } of categoryMap) {
    if (keywords.some(kw => title.includes(kw))) return category;
  }
  return '其他>>其他>>其他';
}

export { EXPORTS_DIR };
