import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Spin } from 'antd';
import { ShoppingCartOutlined, CheckCircleOutlined, DollarOutlined, InboxOutlined } from '@ant-design/icons';
import { getProducts, getListings, getSettings } from '../api';
import dayjs from 'dayjs';

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [listings, setListings] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getProducts({ pageSize: 100 }),
      getListings({ pageSize: 100 }),
      getSettings(),
    ]).then(([pRes, lRes, sRes]) => {
      setProducts(pRes.data.items || []);
      setListings(lRes.data.items || []);
      setSettings(sRes.data || {});
    }).finally(() => setLoading(false));
  }, []);

  const totalProducts = products.length;
  const listedCount = products.filter(p => p.status === 'listed').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const totalCost = products.reduce((sum, p) => sum + (p.cost_price || 0), 0);
  const totalRevenue = products.reduce((sum, p) => sum + (p.selling_price || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0;

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="商品总数" value={totalProducts} prefix={<InboxOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="已上架" value={listedCount} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#3f8600' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="待上架" value={draftCount} prefix={<ShoppingCartOutlined />} valueStyle={{ color: '#cf1322' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="预估总利润" value={`¥${totalProfit.toFixed(2)}`} prefix={<DollarOutlined />} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={`利润概览（均利率: ${avgMargin}%）`}>
            <Row gutter={16}>
              <Col span={8}><Statistic title="总成本" value={`¥${totalCost.toFixed(2)}`} /></Col>
              <Col span={8}><Statistic title="总售价" value={`¥${totalRevenue.toFixed(2)}`} /></Col>
              <Col span={8}><Statistic title="总利润" value={`¥${totalProfit.toFixed(2)}`} /></Col>
            </Row>
            <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
              定价公式：售价 = 成本 × {settings.price_multiplier || '1.8'} + {settings.price_fixed_add || '5'}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="最近商品">
            <Table
              dataSource={products.slice(0, 5)}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: '商品名', dataIndex: 'title', ellipsis: true },
                { title: '成本', dataIndex: 'cost_price', render: v => `¥${v || 0}` },
                { title: '售价', dataIndex: 'selling_price', render: v => `¥${v || 0}` },
                { title: '状态', dataIndex: 'status', render: v => (
                  <Tag color={v === 'listed' ? 'green' : v === 'ready' ? 'blue' : 'default'}>
                    {v === 'listed' ? '已上架' : v === 'ready' ? '待上架' : '草稿'}
                  </Tag>
                )},
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
