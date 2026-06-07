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
    '店铺类目',           // store category
    '宝贝图片',           // main image URL
    '宝贝描述',           // description
    '宝贝卖点',           // selling point (short)
    '宝贝价格',           // price
    '宝贝数量',           // stock quantity
    '上传状态',           // upload status (new)
    '运费承担',           // freight payer (seller)
    '宝贝属性',           // item properties (JSON-like)
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
    try { images = JSON.parse(p.images || '[]'); } catch {}

    const row = [
      escapeField(p.title || ''),
      escapeField(p.category || '中药材/中药饮片'),
      '',
      escapeField(images[0] || ''),
      escapeField(p.description || ''),
      escapeField((p.title || '').slice(0, 40)),
      p.selling_price || p.cost_price || 0,
      '999',
      'new',
      'seller',
      '',
      escapeField(`SKU-${p.id}`),
      '',
      '',
      '2',
      '0',
      new Date().toISOString().slice(0, 10),
      '7',
      escapeField('包邮'),
      '0.5',
      '',
    ];
    rows.push(row.join('\t'));
  }

  writeFileSync(filePath, '﻿' + rows.join('\n'), 'utf-8');
  return filePath;
}

function escapeField(value) {
  const str = String(value || '');
  // TSV escaping: replace tabs and newlines
  return str.replace(/[\t\n\r]/g, ' ');
}

export { EXPORTS_DIR };
