export interface BatchEditRow {
    id: number;
    title?: string;
    shopping_title?: string;
    outerId?: string;
    price?: number;
    deliveryTime?: number;
    skuId?: string;
    skuPrice?: number;
    skuStock?: number;
    skuOuterId?: string;
}
/**
 * Generate a Taobao batch-edit Excel (.xlsx) matching the
 * "excel快速编辑模板.xlsx" format (FastEditItem + edit).
 */
export declare function generateBatchEditExcel(rows: BatchEditRow[], fileName?: string): string;
//# sourceMappingURL=taobao-batch-edit.d.ts.map