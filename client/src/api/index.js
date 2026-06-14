import axios from 'axios';
import { message } from 'antd';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

// Unified error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const msg = error.response?.data?.error || error.message;

    if (status === 400) {
      message.warning(msg || '请求参数错误');
    } else if (status === 404) {
      message.warning(msg || '资源不存在');
    } else if (status === 500) {
      message.error(msg || '服务器内部错误');
    } else if (!error.response) {
      message.error('网络连接失败，请检查服务器是否运行');
    }

    return Promise.reject(error);
  }
);

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
export const getAutoListStatus = () => api.get('/listings/auto-list-status');
export const updateListing = (id, data) => api.put(`/listings/${id}`, data);
export const deleteListing = (id) => api.delete(`/listings/${id}`);

// Settings
export const getSettings = () => api.get('/settings');
export const updateSettings = (data) => api.put('/settings', data);

export default api;
export const exportBatchEdit = (data) => api.post('/products/export-batch-edit', data);
