import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Input, Button, Select, Form, InputNumber, message, Space, Row, Col,
  Tag, Tabs, Typography, List, Divider, Checkbox, Spin, Empty, Image, Badge, Alert,
} from 'antd';
import {
  LinkOutlined, PlusOutlined, InboxOutlined, ThunderboltOutlined,
  CheckCircleOutlined, SearchOutlined, ShoppingCartOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { extractUrl, importManual, searchSource as searchSourceAPI } from '../api';

const { TextArea } = Input;
const { Text, Title } = Typography;

const PLATFORM_OPTIONS = [
  { value: '1688', label: '1688', color: 'blue' },
  { value: 'pdd', label: '拼多多', color: 'red' },
  { value: 'jd', label: '京东', color: 'volcano' },
  { value: 'other', label: '其他', color: 'default' },
];

const QUICK_PRODUCTS = [
  { title: '宁夏特级枸杞 500g', price: 18.5, platform: '1688', tags: '养生,泡茶' },
  { title: '甘肃黄芪切片 250g', price: 22.0, platform: '1688', tags: '补气,煲汤' },
  { title: '云南文山三七粉 100g', price: 35.0, platform: '1688', tags: '化瘀,保健' },
  { title: '霍山铁皮石斛 50g', price: 45.0, platform: '1688', tags: '滋阴,养生' },
  { title: '新会陈皮 十年陈 100g', price: 28.0, platform: '1688', tags: '理气,泡茶' },
  { title: '西藏那曲冬虫夏草 10g', price: 120.0, platform: '1688', tags: '补肺,高端' },
  { title: '长白山灵芝孢子粉 100g', price: 55.0, platform: '1688', tags: '破壁,保健' },
  { title: '浙江杭白菊花 250g', price: 12.0, platform: '1688', tags: '清热,明目' },
];

export default function Sourcing() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [urlLoading, setUrlLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [batchText, setBatchText] = useState('');
  const [recentImports, setRecentImports] = useState([]);

  // --- Search state ---
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [searchSource, setSearchSource] = useState(''); // 'real', 'mock', 'cache'

  // --- Search 1688 ---
  const handleSearch = async () => {
    const kw = searchKeyword.trim();
    if (!kw) return message.warning('请输入商品名称');
    setSearching(true);
    setSearchErr('');
    setSearchResults([]);
    setSelectedProducts([]);
    setSearchSource('');
    try {
      const { data } = await searchSourceAPI({ keyword: kw, limit: 20 });
      console.log('Search response:', data); // Debug log
      if (data.ok && data.products && data.products.length > 0) {
        setSearchResults(data.products);
        setSearchSource(data.source || 'real');
        message.success(`找到 ${data.products.length} 个商品`);
      } else {
        setSearchErr('未找到匹配商品，请尝试其他关键词');
        message.info('未找到匹配商品');
      }
    } catch (err) {
      console.error('Search error:', err);
      const msg = err?.response?.data?.error || '搜索失败，请稍后重试';
      setSearchErr(msg);
      message.error(msg);
    }
    setSearching(false);
  };

  // --- Toggle product selection ---
  const toggleSelect = (idx) => {
    setSelectedProducts((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      return [...prev, idx];
    });
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === searchResults.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(searchResults.map((_, i) => i));
    }
  };

  // --- Confirm & add to listing ---
  const handleConfirmToListing = async () => {
    if (selectedProducts.length === 0) {
      return message.warning('请先选择商品');
    }
    setConfirming(true);
    try {
      const toImport = selectedProducts.map((i) => ({
        title: searchResults[i].title,
        price: searchResults[i].price,
        platform: searchResults[i].platform || '1688',
        url: searchResults[i].url || '',
        images: searchResults[i].image ? [searchResults[i].image] : [],
        description: searchResults[i].shop || '',
        tags: searchKeyword,
      }));

      const { data } = await importManual({ products: toImport });
      if (data.imported > 0) {
        setRecentImports((prev) => [...data.products, ...prev].slice(0, 20));
        message.success(
          `已导入 ${data.imported} 件商品，售价 ¥${data.products[0]?.selling_price || 0}`
        );
        setSearchResults([]);
        setSelectedProducts([]);
        setSearchKeyword('');
        // Navigate to listing management
        navigate('/listings');
      }
    } catch {
      message.error('导入失败');
    }
    setConfirming(false);
  };

  // Handle URL extraction
  const handleExtract = async () => {
    const url = form.getFieldValue('source_url');
    if (!url) return message.warning('请粘贴商品链接');
    setUrlLoading(true);
    setExtracted(null);
    try {
      const { data } = await extractUrl({ url });
      if (data.ok && data.extracted) {
        const info = data.extracted;
        form.setFieldsValue({
          title: info.title || '',
          price: info.price || 0,
          platform: info.platform || '1688',
        });
        setExtracted(info);
        message.success('已提取商品信息，请核对后导入');
      } else {
        form.setFieldsValue({ platform: data.platform || '1688' });
        setExtracted({ platform: data.platform });
        message.info('未能自动提取，请手动填写信息后导入');
      }
    } catch {
      message.error('提取失败，请检查链接或手动填写');
    }
    setUrlLoading(false);
  };

  // Import single product
  const handleImportSingle = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    if (!values.title) return message.warning('请输入商品标题');
    setImportLoading(true);
    try {
      const { data } = await importManual({
        products: [
          {
            title: values.title,
            price: values.price || 0,
            platform: values.platform || '1688',
            url: values.source_url || '',
            description: values.description || '',
            tags: values.tags || '',
          },
        ],
      });
      if (data.imported > 0) {
        message.success(`已导入: ${data.products[0].title}（售价 ¥${data.products[0].selling_price}）`);
        setRecentImports((prev) => [data.products[0], ...prev].slice(0, 10));
        form.resetFields();
        setExtracted(null);
      }
    } catch {
      message.error('导入失败');
    }
    setImportLoading(false);
  };

  // Import quick product
  const handleQuickImport = async (product) => {
    try {
      const { data } = await importManual({ products: [product] });
      if (data.imported > 0) {
        message.success(`已导入: ${product.title}`);
        setRecentImports((prev) => [data.products[0], ...prev].slice(0, 10));
      }
    } catch {
      message.error('导入失败');
    }
  };

  // Batch import
  const handleBatchImport = async () => {
    const lines = batchText.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return message.warning('请输入商品信息');

    const products = lines
      .map((line) => {
        const parts = line.split(/[,\t\s]{2,}/);
        const lastNum = parts.filter((p) => /^[\d.]+$/.test(p.trim()));
        const title = parts.filter((p) => !/^[\d.]+$/.test(p.trim())).join(' ');
        return {
          title: title || line.slice(0, 50),
          price: parseFloat(lastNum[0]) || 0,
          platform: '1688',
        };
      })
      .filter((p) => p.title);

    if (products.length === 0) return message.warning('未能解析商品信息');

    try {
      const { data } = await importManual({ products });
      message.success(`批量导入成功: ${data.imported} 个商品`);
      setBatchText('');
      setRecentImports((prev) => [...data.products, ...prev].slice(0, 20));
    } catch {
      message.error('导入失败');
    }
  };

  // ==== Search results tab (primary) ====
  const searchTab = {
    key: 'search',
    label: (
      <span>
        <SearchOutlined /> 搜索选品
      </span>
    ),
    children: (
      <div>
        {/* Search bar */}
        <div style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
            <Input
              size="large"
              placeholder="输入商品名称，如：花茶、枸杞、黄芪..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            />
            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={searching}
            >
              搜索1688
            </Button>
          </Space.Compact>
        </div>

        {/* Loading */}
        {searching && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#999' }}>正在 1688 搜索 "{searchKeyword}"...</div>
          </div>
        )}

        {/* Error */}
        {!searching && searchErr && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Empty description={searchErr} />
            <Button
              type="link"
              onClick={() => {
                setSearchErr('');
                setSearchKeyword('');
              }}
            >
              换个关键词试试
            </Button>
          </div>
        )}

        {/* Results */}
        {!searching && searchResults.length > 0 && (
          <div>
            {/* Search source indicator */}
            {searchSource === 'mock' && (
              <Alert
                message="当前为离线商品数据（仅供参考），实际搜索可能被1688限制"
                type="warning"
                showIcon
                closable
                style={{ marginBottom: 12 }}
              />
            )}
            {/* Selection bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                padding: '8px 12px',
                background: selectedProducts.length > 0 ? '#e6f4ff' : '#fafafa',
                borderRadius: 8,
                border: selectedProducts.length > 0 ? '1px solid #91caff' : '1px solid #f0f0f0',
              }}
            >
              <Space>
                <Checkbox
                  checked={selectedProducts.length === searchResults.length}
                  indeterminate={
                    selectedProducts.length > 0 &&
                    selectedProducts.length < searchResults.length
                  }
                  onChange={toggleSelectAll}
                >
                  全选
                </Checkbox>
                <Text type="secondary">
                  已选{' '}
                  <Text strong style={{ color: '#1677ff' }}>
                    {selectedProducts.length}
                  </Text>{' '}
                  / {searchResults.length} 件
                </Text>
              </Space>
              <Button
                type="primary"
                size="large"
                icon={<RocketOutlined />}
                onClick={handleConfirmToListing}
                loading={confirming}
                disabled={selectedProducts.length === 0}
              >
                确认加入上架管理
              </Button>
            </div>

            {/* Product grid */}
            <Row gutter={[12, 12]}>
              {searchResults.map((product, idx) => {
                const isSelected = selectedProducts.includes(idx);
                return (
                  <Col xs={12} sm={8} md={6} lg={6} xl={4} key={idx}>
                    <Badge.Ribbon
                      text={isSelected ? '已选' : ''}
                      color="blue"
                      style={{ display: isSelected ? 'block' : 'none' }}
                    >
                      <Card
                        hoverable
                        size="small"
                        style={{
                          border: isSelected ? '2px solid #1677ff' : '1px solid #f0f0f0',
                          borderRadius: 8,
                          overflow: 'hidden',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleSelect(idx)}
                        cover={
                          product.image ? (
                            <div
                              style={{
                                height: 160,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#fafafa',
                              }}
                            >
                              <img
                                src={product.image}
                                alt={product.title}
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain',
                                }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                height: 160,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#fafafa',
                                color: '#ccc',
                                fontSize: 36,
                              }}
                            >
                              <ShoppingCartOutlined />
                            </div>
                          )
                        }
                      >
                        <div
                          style={{
                            fontSize: 12,
                            lineHeight: 1.4,
                            height: 34,
                            overflow: 'hidden',
                            marginBottom: 8,
                            color: '#333',
                          }}
                          title={product.title}
                        >
                          {product.title}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Text strong style={{ color: '#cf1322', fontSize: 16 }}>
                            ¥{product.price}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            起批价
                          </Text>
                        </div>
                        {product.shop && (
                          <div
                            style={{
                              fontSize: 10,
                              color: '#999',
                              marginTop: 4,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {product.shop}
                          </div>
                        )}
                      </Card>
                    </Badge.Ribbon>
                  </Col>
                );
              })}
            </Row>

            {/* Bottom confirm bar */}
            {searchResults.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  textAlign: 'center',
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 8,
                }}
              >
                <Button
                  type="primary"
                  size="large"
                  icon={<RocketOutlined />}
                  onClick={handleConfirmToListing}
                  loading={confirming}
                  disabled={selectedProducts.length === 0}
                >
                  将选中的 {selectedProducts.length || 0} 件商品加入上架管理
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Empty state (no search yet) */}
        {!searching && searchResults.length === 0 && !searchErr && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <SearchOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
            <div style={{ color: '#999', marginBottom: 8 }}>输入商品名称，从 1688 搜索货源</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              支持搜索：花茶、枸杞、黄芪、三七...等各类商品
            </Text>
          </div>
        )}
      </div>
    ),
  };

  const tabItems = [
    searchTab,
    {
      key: 'url',
      label: (
        <span>
          <LinkOutlined /> 链接导入
        </span>
      ),
      children: (
        <div>
          <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
            <Form.Item label="粘贴货源链接（1688/拼多多/京东商品页）">
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="source_url" noStyle>
                  <Input placeholder="https://detail.1688.com/offer/xxxxx.html" />
                </Form.Item>
                <Button type="primary" icon={<LinkOutlined />} onClick={handleExtract} loading={urlLoading}>
                  提取信息
                </Button>
              </Space.Compact>
            </Form.Item>

            {extracted && (
              <div
                style={{
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <Text>
                    {extracted.title ? '已提取商品信息，请核对并修改' : '请手动填写商品信息'}
                  </Text>
                </Space>
              </div>
            )}

            <Form.Item name="title" label="商品标题" rules={[{ required: true, message: '请输入商品标题' }]}>
              <Input placeholder="淘宝商品标题，建议包含关键词" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="price" label="拿货价（元）" rules={[{ required: true }]}>
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="成本价" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="platform" label="来源平台">
                  <Select options={PLATFORM_OPTIONS.map((p) => ({ value: p.value, label: p.label }))} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="tags" label="标签">
                  <Input placeholder="如：养生,泡茶" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="商品描述（可选）">
              <TextArea rows={2} placeholder="简短描述" />
            </Form.Item>
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={handleImportSingle}
              loading={importLoading}
              block
            >
              导入到商品库
            </Button>
          </Form>
        </div>
      ),
    },
    {
      key: 'batch',
      label: (
        <span>
          <InboxOutlined /> 批量录入
        </span>
      ),
      children: (
        <div style={{ maxWidth: 640 }}>
          <div style={{ marginBottom: 12, color: '#666' }}>
            <Text>
              每行一个商品，格式：<Tag>商品名称 价格</Tag> 或 <Tag>商品名称,价格</Tag>
            </Text>
            <br />
            <Text type="secondary">示例：宁夏枸杞 500g 18.5</Text>
          </div>
          <TextArea
            rows={8}
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={
              '宁夏特级枸杞 500g 18.5\n甘肃黄芪切片 250g 22.0\n云南三七粉 100g 35.0'
            }
          />
          <Button
            type="primary"
            size="large"
            icon={<InboxOutlined />}
            onClick={handleBatchImport}
            style={{ marginTop: 12 }}
            block
          >
            批量导入（{batchText.trim().split('\n').filter(Boolean).length} 个商品）
          </Button>
        </div>
      ),
    },
    {
      key: 'quick',
      label: (
        <span>
          <ThunderboltOutlined /> 快速模板
        </span>
      ),
      children: (
        <div>
          <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
            常用中药养生产品类模板，点击即可一键导入（价格仅供参考，请按实际拿货价修改）
          </Text>
          <List
            grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }}
            dataSource={QUICK_PRODUCTS}
            renderItem={(item) => (
              <List.Item>
                <Card
                  size="small"
                  hoverable
                  actions={[
                    <Button type="link" icon={<PlusOutlined />} onClick={() => handleQuickImport(item)}>
                      一键导入
                    </Button>,
                  ]}
                >
                  <Card.Meta
                    title={<span style={{ fontSize: 14 }}>{item.title}</span>}
                    description={
                      <Space wrap>
                        <Tag color={PLATFORM_OPTIONS.find((p) => p.value === item.platform)?.color}>
                          {item.platform}
                        </Tag>
                        <Text strong style={{ color: '#cf1322' }}>
                          ¥{item.price}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          成本价
                        </Text>
                      </Space>
                    }
                  />
                </Card>
              </List.Item>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <Card title="导入货源商品" style={{ marginBottom: 16 }}>
        <Tabs defaultActiveKey="search" items={tabItems} />
      </Card>

      {recentImports.length > 0 && (
        <Card title={`最近导入（${recentImports.length}）`} size="small">
          <Space wrap>
            {recentImports.map((p, i) => (
              <Tag key={i} color="green" style={{ marginBottom: 8 }}>
                {p.title?.slice(0, 30)} ¥{p.selling_price}
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      <Card size="small" style={{ marginTop: 16, background: '#fafafa' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          使用说明：在搜索框输入商品名 → 从1688搜索结果中选择 → 点击"确认加入上架管理" → 在「上架管理」中点击「一键上架」，自动打开浏览器填写淘宝发布页。
        </Text>
        <Divider style={{ margin: '8px 0' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          定价公式：售价 = 成本 × 倍率 + 固定加价（可在「设置」页修改，当前默认 1.8 倍 + ¥5）
        </Text>
      </Card>
    </div>
  );
}
