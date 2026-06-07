import React, { useState, useEffect } from 'react';
import {
  Table, Button, Space, Tag, Input, Modal, Form, InputNumber, Select,
  message, Popconfirm, Row, Col, Card, Statistic,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, DollarOutlined, ExportOutlined } from '@ant-design/icons';
import { getProducts, createProduct, updateProduct, deleteProduct, batchUpdatePrice, generateCSV, getSettings } from '../api';

export default function ProductLibrary() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [editModal, setEditModal] = useState(null);
  const [batchPriceModal, setBatchPriceModal] = useState(false);
  const [settings, setSettings] = useState({});
  const [form] = Form.useForm();

  const fetchData = (p = page, kw = keyword, sf = statusFilter) => {
    setLoading(true);
    getProducts({ page: p, pageSize: 20, keyword: kw, status: sf }).then(({ data }) => {
      setData(data.items);
      setTotal(data.total);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchData(1, keyword, statusFilter); }, [statusFilter]);
  useEffect(() => { getSettings().then(({ data }) => setSettings(data)); }, []);

  const handleSearch = () => fetchData(1, keyword, statusFilter);

  const handleEdit = (record) => {
    setEditModal(record);
    form.setFieldsValue({
      ...record,
      images: (() => { try { return JSON.parse(record.images || '[]'); } catch { return []; } })(),
    });
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (editModal.id) {
      await updateProduct(editModal.id, values);
      message.success('已更新');
    } else {
      await createProduct(values);
      message.success('已创建');
    }
    setEditModal(null);
    fetchData();
  };

  const handleDelete = async (id) => {
    await deleteProduct(id);
    message.success('已删除');
    fetchData();
  };

  const handleBatchPrice = async () => {
    const values = await form.validateFields();
    await batchUpdatePrice({
      ids: selectedRows.map(r => r.id),
      ...values,
    });
    message.success(`已批量改价 ${selectedRows.length} 个商品`);
    setBatchPriceModal(false);
    setSelectedRows([]);
    fetchData();
  };

  const handleGenerateCSV = async () => {
    if (selectedRows.length === 0) return message.warning('请选择商品');
    try {
      const { data: result } = await generateCSV({ productIds: selectedRows.map(r => r.id) });
      message.success(`已生成 CSV 文件: ${result.fileName}`);
      setSelectedRows([]);
      fetchData();
    } catch (err) {
      message.error('生成失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '商品名', dataIndex: 'title', ellipsis: true },
    { title: '来源', dataIndex: 'platform', width: 80, render: v => <Tag>{v || '手动'}</Tag> },
    { title: '成本价', dataIndex: 'cost_price', width: 90, render: v => `¥${v || 0}` },
    {
      title: '售价', dataIndex: 'selling_price', width: 90,
      render: v => <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{v || 0}</span>,
    },
    {
      title: '利润率', dataIndex: 'profit_margin', width: 80,
      render: v => <Tag color={v > 30 ? 'green' : v > 15 ? 'blue' : 'orange'}>{v || 0}%</Tag>,
    },
    { title: '类目', dataIndex: 'category', width: 120, ellipsis: true },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: v => (
        <Tag color={v === 'listed' ? 'green' : v === 'ready' ? 'blue' : 'default'}>
          {v === 'listed' ? '已上架' : v === 'ready' ? '待上架' : '草稿'}
        </Tag>
      ),
    },
    {
      title: '操作', width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statsTotal = data.length > 0 ? total : 0;
  const listedCount = data.filter(p => p.status === 'listed').length;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="商品总数" value={statsTotal} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="默认加价倍率" value={`${settings.price_multiplier || 1.8}x`} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="固定加价" value={`¥${settings.price_fixed_add || 5}`} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="默认类目" value={settings.default_category || '-'} valueStyle={{ fontSize: 12 }} /></Card></Col>
      </Row>

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
            <Input.Search
              placeholder="搜索商品名"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 240 }}
              allowClear
            />
            <Select
              placeholder="状态筛选"
              allowClear
              value={statusFilter || undefined}
              onChange={v => setStatusFilter(v || '')}
              style={{ width: 120 }}
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'ready', label: '待上架' },
                { value: 'listed', label: '已上架' },
              ]}
            />
          </Space>
          <Space wrap>
            {selectedRows.length > 0 && (
              <>
                <Button icon={<DollarOutlined />} onClick={() => {
                  setBatchPriceModal(true);
                  form.resetFields();
                }}>批量改价</Button>
                <Button type="primary" icon={<ExportOutlined />} onClick={handleGenerateCSV}>生成CSV上架</Button>
              </>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setEditModal({});
              form.resetFields();
            }}>手动添加商品</Button>
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          rowSelection={{
            selectedRowKeys: selectedRows.map(r => r.id),
            onChange: (_, rows) => setSelectedRows(rows),
          }}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            showTotal: t => `共 ${t} 个商品`,
            onChange: (p) => { setPage(p); fetchData(p); },
          }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Edit/Create Modal */}
      <Modal
        title={editModal?.id ? '编辑商品' : '添加商品'}
        open={!!editModal}
        onOk={handleSave}
        onCancel={() => setEditModal(null)}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="商品标题" rules={[{ required: true }]}>
            <Input placeholder="淘宝商品标题（建议30字以上含关键词）" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="cost_price" label="成本价（元）" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="拿货成本" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="selling_price" label="售价（元）">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="自动计算，可手动修改" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="category" label="淘宝类目">
            <Input placeholder={settings.default_category || '中药材/中药饮片'} />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="如：养生、泡茶、煲汤" />
          </Form.Item>
          <Form.Item name="description" label="商品描述">
            <Input.TextArea rows={4} placeholder="商品详情描述，支持换行" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Batch Price Modal */}
      <Modal
        title="批量改价"
        open={batchPriceModal}
        onOk={handleBatchPrice}
        onCancel={() => setBatchPriceModal(false)}
      >
        <p>将为选中的 {selectedRows.length} 个商品重新计算售价</p>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="multiplier" label="加价倍率" initialValue={parseFloat(settings.price_multiplier) || 1.8}>
                <InputNumber min={1} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fixed_add" label="固定加价（元）" initialValue={parseFloat(settings.price_fixed_add) || 5}>
                <InputNumber min={0} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
