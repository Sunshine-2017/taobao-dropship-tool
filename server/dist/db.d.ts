export interface Product {
    [key: string]: unknown;
    id: number;
    source_product_id: number | null;
    title: string;
    cost_price: number;
    selling_price: number;
    profit_margin: number;
    description: string;
    images: string;
    category: string;
    tags: string;
    platform: string;
    status: 'draft' | 'ready' | 'listed' | 'failed';
    created_at: string;
    updated_at: string;
}
export interface Listing {
    [key: string]: unknown;
    id: number;
    product_id: number;
    taobao_item_id: string | null;
    status: 'pending' | 'listed' | 'failed';
    csv_path: string | null;
    listed_at: string | null;
    created_at: string;
}
export interface SourceProduct {
    [key: string]: unknown;
    id: number;
    platform: string;
    source_id: string;
    title: string;
    price: number;
    images: string;
    description: string;
    specs: string;
    url: string;
    created_at: string;
}
export interface SettingsEntry {
    [key: string]: string;
    key: string;
    value: string;
}
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export interface PaginateOptions {
    page?: number;
    pageSize?: number;
    filters?: Record<string, unknown>;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
//# sourceMappingURL=db.d.ts.map