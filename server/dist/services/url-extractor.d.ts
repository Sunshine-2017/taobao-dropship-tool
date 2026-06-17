export interface ExtractedProductInfo {
    title: string;
    price: number;
    images: string[];
    description: string;
    source_id: string;
    platform: string;
    specs: Record<string, unknown>;
}
/** Best-effort product info extraction from URLs via page metadata */
export declare function extractProductInfo(url: string): Promise<ExtractedProductInfo | null>;
//# sourceMappingURL=url-extractor.d.ts.map