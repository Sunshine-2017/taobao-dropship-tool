import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
const EXPORTS_DIR = join(process.cwd(), 'data', 'exports');
/** Generate Taobao Assistant compatible CSV (TSV with BOM) */
export function generateTaobaoCSV(products, keyword = '') {
    if (!existsSync(EXPORTS_DIR)) {
        mkdirSync(EXPORTS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = keyword ? keyword.replace(/[/\\:*?"<>|]/g, '').slice(0, 20) : 'taobao-listings';
    const fileName = `${prefix}-${timestamp}.csv`;
    const filePath = join(EXPORTS_DIR, fileName);
    const headers = [
        '宝贝名称', '宝贝类目', '店铺类目', '宝贝图片', '宝贝描述',
        '宝贝卖点', '宝贝价格', '宝贝数量', '上传状态', '运费承担',
        '宝贝属性', '商家编码', '销售属性组合', '宝贝规格', '付款模式',
        '会员打折', '生效时间', '间隔天数', '运费模板', '宝贝重量', '宝贝体积',
    ];
    const rows = [headers.join('\t')];
    for (const p of products) {
        let images = [];
        try {
            images = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []);
        }
        catch {
            images = [];
        }
        const category = p.category || getDefaultCategory(p) || '';
        const imageStr = images.length > 0 ? images.join('|') : '';
        const desc = p.description || `${p.title}，产地直发，品质保证`;
        const price = p.selling_price || (p.cost_price ? Math.round(p.cost_price * 1.8 * 100) / 100 : 0);
        const stock = p.stock_quantity || p.stock || '9999';
        const row = [
            escapeField(p.title || ''),
            escapeField(category),
            escapeField(category),
            escapeField(imageStr),
            escapeField(desc),
            escapeField((p.title || '').slice(0, 40)),
            price,
            stock,
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
    return String(value || '').replace(/[\t\n\r]/g, ' ');
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
        if (keywords.some(kw => title.includes(kw)))
            return category;
    }
    return '其他>>其他>>其他';
}
export { EXPORTS_DIR };
//# sourceMappingURL=taobao-csv.js.map