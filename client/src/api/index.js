import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

// Products
export const getProducts = (params) => api.get('/products', { params });
export const getProduct = (id) => api.get(`/products/${id}`);
export const createProduct = (data) => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id) => api.delete(`/products/${id}`);
export const batchUpdatePrice = (data) => api.put('/products/batch/price', data);

// Sourcing
export const extractUrl = (data) => api.post('/sourcing/extract-url', data);
export const importManual = (data) => api.post('/sourcing/import-manual', data);
export const searchSource = (data) => api.post('/sourcing/search', data);
export const getSearchStatus = (taskId) => api.get(`/sourcing/status/${taskId}`);
export const importProducts = (data) => api.post('/sourcing/import', data);

// Listings
export const getListings = (params) => api.get('/listings', { params });
export const generateCSV = (data) => api.post('/listings/generate-csv', data);
export const autoListTaobao = (data) => api.post('/listings/auto-list', data, { timeout: 300000 });
export const updateListing = (id, data) => api.put(`/listings/${id}`, data);
export const deleteListing = (id) => api.delete(`/listings/${id}`);

// Settings
export const getSettings = () => api.get('/settings');
export const updateSettings = (data) => api.put('/settings', data);

export default api;
