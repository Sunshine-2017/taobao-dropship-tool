import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import XLSX from 'xlsx';
const EXPORTS_DIR = join(process.cwd(), 'data', 'exports');
if (!existsSync(EXPORTS_DIR))
    mkdirSync(EXPORTS_DIR, { recursive: true });
/**
 * Generate a Taobao batch-edit Excel (.xlsx) matching the
 * "excel快速编辑模板.xlsx" format (FastEditItem + edit).
 */
export function generateBatchEditExcel(rows, fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = fileName || `batch-edit-${timestamp}`;
    const filePath = join(EXPORTS_DIR, `${name}.xlsx`);
    // Sheet 1: 发布模板 (visible data)
    const headerRows = [
        ['注意：\r\n1. 支持宝贝标题、导购标题、商家编码、发货时间、价格、库存的批量导入修改。\r\n2. 需要修改销售规格信息时，若商品没有SKU，则填写商品id及对应的销售规格信息；若商品有SKU，则需要填写商品id+skuid，每个skuid都需要有对应的商品id。\r\n3. 商品现有信息可去往商品管理后台-更多批量操作-excel商品批量导出获得。\r\n\r\n\r\n'],
        ['商品信息', null, null, null, null, '发货时间信息', 'SKU信息'],
        ['商品id', '宝贝标题', '导购标题', '商家编码', '一口价', '发货时间（单位：天）', 'skuId', '价格（元）', '数量', '商家编码'],
    ];
    const dataRows = rows.map(r => [
        r.id,
        r.title ?? '',
        r.shopping_title ?? '',
        r.outerId ?? '',
        r.price ?? '',
        r.deliveryTime ?? '',
        r.skuId ?? '',
        r.skuPrice ?? '',
        r.skuStock ?? '',
        r.skuOuterId ?? '',
    ]);
    const wsData = [...headerRows, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
        { wch: 12 }, { wch: 40 }, { wch: 20 }, { wch: 15 },
        { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 15 },
    ];
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
        { s: { r: 1, c: 5 }, e: { r: 1, c: 5 } },
        { s: { r: 1, c: 6 }, e: { r: 1, c: 9 } },
    ];
    // Sheet 2: 发布模板_hide (API field names)
    const hideWs = XLSX.utils.aoa_to_sheet([
        ['identity', 'version'],
        ['general-taobao-100', '0'],
        ['id', 'title', 'shopping_title', 'outerId', 'price', 'deliveryTime',
            'partSku.skuId', 'partSku.skuPrice', 'partSku.skuStock', 'partSku.skuOuterId'],
    ]);
    // Sheet 3: global_hide (flow metadata)
    const globalHideWs = XLSX.utils.aoa_to_sheet([
        ['version', 'excelActionType', 'flowNodeType', 'requestActionType', 'fieldType', 'excelSystemParam', 'headerTips'],
        ['1.0', 'null', 'FastEditItem', 'edit', '1', '{}', 'true'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '发布模板');
    XLSX.utils.book_append_sheet(wb, hideWs, '发布模板_hide');
    XLSX.utils.book_append_sheet(wb, globalHideWs, 'global_hide');
    XLSX.writeFile(wb, filePath);
    return filePath;
}
//# sourceMappingURL=taobao-batch-edit.js.map