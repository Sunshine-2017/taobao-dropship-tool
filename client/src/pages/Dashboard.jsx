import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Table, Tag, Spin, Button, Space, Empty } from 'antd';
import {
  ShoppingCartOutlined, CheckCircleOutlined, DollarOutlined,
  InboxOutlined, SearchOutlined, ExportOutlined, RocketOutlined,
} from '@ant-design/icons';
import { getProducts, getListings, getSettings } from '../api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [listings, setListings] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getProducts({ pageSize: 200 }),
      getListings({ pageSize: 200 }),
      getSettings(),
    ]).then(([pRes, lRes, sRes]) => {
      setProducts(pRes.data.items || []);
      setListings(lRes.data.items || []);
      setSettings(sRes.data || {});
    }).finally(() => setLoading(false));
  }, []);

  const totalProducts = products.length;
  const listedCount = products.filter(p => p.status === 'listed').length;
  const readyCount = products.filter(p => p.status === 'ready').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const totalCost = products.reduce((sum, p) => sum + (p.cost_price || 0), 0);
  const totalRevenue = products.reduce((sum, p) => sum + (p.selling_price || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0;

  const successListings = listings.filter(l => l.status === 'listed').length;
  const failedListings = listings.filter(l => l.status === 'failed').length;

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      {/* Stats cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/products')}>
            <Statistic title="商品总数" value={totalProducts} prefix={<InboxOutlined />} />
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              草稿 {draftCount} · 待上架 {readyCount} · 已上架 {listedCount}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="已上架" value={listedCount} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#3f8600' }} />
            {successListings > 0 && (
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                通过工具上架 {successListings} 件
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="预估总利润" value={`¥${totalProfit.toFixed(2)}`} prefix={<DollarOutlined />} valueStyle={{ color: '#1677ff' }} />
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              平均利润率 {avgMargin}%
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="上架记录" value={listings.length} prefix={<RocketOutlined />} />
            {failedListings > 0 && (
              <div style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>
                {failedListings} 条失败记录
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Profit overview */}
        <Col xs={24} lg={12}>
          <Card title={`利润概览（均利率: ${avgMargin}%）`}>
            <Row gutter={16}>
              <Col span={8}><Statistic title="总成本" value={`¥${totalCost.toFixed(2)}`} /></Col>
              <Col span={8}><Statistic title="总售价" value={`¥${totalRevenue.toFixed(2)}`} /></Col>
              <Col span={8}><Statistic title="总利润" value={`¥${totalProfit.toFixed(2)}`} valueStyle={{ color: '#3f8600' }} /></Col>
            </Row>
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6ffed', borderRadius: 6, fontSize: 12 }}>
              定价公式：售价 = 成本 × {settings.price_multiplier || '1.8'} + ¥{settings.price_fixed_add || '5'}
            </div>
          </Card>
        </Col>

        {/* Quick actions */}
        <Col xs={24} lg={12}>
          <Card title="快速操作">
            {totalProducts === 0 ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Empty description="还没有商品" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                <Space style={{ marginTop: 12 }}>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => navigate('/sourcing')}>
                    搜索选品
                  </Button>
                  <Button icon={<InboxOutlined />} onClick={() => navigate('/products')}>
                    手动添加
                  </Button>
                </Space>
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Button block icon={<SearchOutlined />} onClick={() => navigate('/sourcing')} size="large">
                  搜索1688货源
                </Button>
                <Button block icon={<ExportOutlined />} onClick={() => navigate('/listings')} size="large">
                  上架管理 & 导出CSV
                </Button>
                <Button block icon={<InboxOutlined />} onClick={() => navigate('/products')} size="large">
                  商品库管理
                </Button>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* Recent products */}
      {products.length > 0 && (
        <Card title="最近商品" style={{ marginTop: 16 }}>
          <Table
            dataSource={products.slice(0, 5)}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { title: '商品名', dataIndex: 'title', ellipsis: true },
              { title: '来源', dataIndex: 'platform', width: 70, render: v => <Tag>{v || '-'}</Tag> },
              { title: '成本', dataIndex: 'cost_price', width: 80, render: v => `¥${v || 0}` },
              { title: '售价', dataIndex: 'selling_price', width: 80, render: v => <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{v || 0}</span> },
              { title: '状态', dataIndex: 'status', width: 80, render: v => (
                <Tag color={v === 'listed' ? 'green' : v === 'ready' ? 'blue' : 'default'}>
                  {v === 'listed' ? '已上架' : v === 'ready' ? '待上架' : '草稿'}
                </Tag>
              )},
            ]}
          />
        </Card>
      )}

      {/* Usage guide */}
      <Card size="small" style={{ marginTop: 16, background: '#fafafa' }}>
        <div style={{ fontSize: 12, color: '#888', lineHeight: 2 }}>
          <strong>使用流程：</strong>
          ① 在「货源搜索」中搜索1688商品 →
          ② 选择商品导入商品库 →
          ③ 在「商品库」中管理商品信息（可选） →
          ④ 在「上架管理」中点击「一键上架」→ 自动打开浏览器填写淘宝发布页
        </div>
      </Card>
    </div>
  );
}
