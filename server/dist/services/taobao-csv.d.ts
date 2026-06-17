declare const EXPORTS_DIR: string;
export interface CsvProduct {
    id: number;
    title: string;
    selling_price?: number;
    cost_price?: number;
    images?: string;
    description?: string;
    category?: string;
    stock_quantity?: number;
    stock?: number;
}
/** Generate Taobao Assistant compatible CSV (TSV with BOM) */
export declare function generateTaobaoCSV(products: CsvProduct[], keyword?: string): string;
export { EXPORTS_DIR };
//# sourceMappingURL=taobao-csv.d.ts.map