import React, { useState, useEffect } from 'react';
import {
  Table, Button, Space, Tag, Input, Modal, Form, InputNumber, Select,
  message, Popconfirm, Row, Col, Card, Statistic,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, DollarOutlined, ExportOutlined, TagsOutlined } from '@ant-design/icons';
import { getProducts, createProduct, updateProduct, deleteProduct, batchUpdatePrice, generateCSV, getSettings, exportBatchEdit } from '../api';

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
  const [batchCategoryModal, setBatchCategoryModal] = useState(false);
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
    const images = (() => { try { return JSON.parse(record.images || '[]'); } catch { return []; } })();
    form.setFieldsValue({
      ...record,
      images: Array.isArray(images) ? images.join('\n') : '',
    });
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    // Convert images from newline-separated text to JSON array
    if (values.images && typeof values.images === 'string') {
      values.images = values.images.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (editModal.id) {
      await updateProduct(editModal.id, values);
      message.success('宸叉洿鏂?);
    } else {
      await createProduct(values);
      message.success('宸插垱寤?);
    }
    setEditModal(null);
    fetchData();
  };

  const handleDelete = async (id) => {
    await deleteProduct(id);
    message.success('宸插垹闄?);
    fetchData();
  };

  const handleBatchPrice = async () => {
    const values = await form.validateFields();
    await batchUpdatePrice({
      ids: selectedRows.map(r => r.id),
      ...values,
    });
    message.success(`宸叉壒閲忔敼浠?${selectedRows.length} 涓晢鍝乣);
    setBatchPriceModal(false);
    setSelectedRows([]);
    fetchData();
  };

  const handleBatchDelete = async () => {
    const ids = selectedRows.map(r => r.id);
    let success = 0;
    for (const id of ids) {
      try { await deleteProduct(id); success++; } catch {}
    }
    message.success(`宸插垹闄?${success} 涓晢鍝乣);
    setSelectedRows([]);
    fetchData();
  };

  const handleBatchCategory = async () => {
    const category = form.getFieldValue('batch_category');
    if (!category) return message.warning('璇疯緭鍏ョ被鐩?);
    let success = 0;
    for (const row of selectedRows) {
      try { await updateProduct(row.id, { category }); success++; } catch {}
    }
    message.success(`宸叉洿鏂?${success} 涓晢鍝佺殑绫荤洰`);
    setBatchCategoryModal(false);
    setSelectedRows([]);
    fetchData();
  };

  const handleGenerateCSV = async () => {
    if (selectedRows.length === 0) return message.warning('璇烽€夋嫨鍟嗗搧');
    try {
      const { data: result } = await generateCSV({ productIds: selectedRows.map(r => r.id) });
      message.success(`宸茬敓鎴?CSV 鏂囦欢: ${result.fileName}`);
      setSelectedRows([]);
      fetchData();
    } catch (err) {
      message.error('鐢熸垚澶辫触');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '鍟嗗搧鍚?, dataIndex: 'title', ellipsis: true },
    { title: '鏉ユ簮', dataIndex: 'platform', width: 80, render: v => <Tag>{v || '鎵嬪姩'}</Tag> },
    { title: '鎴愭湰浠?, dataIndex: 'cost_price', width: 90, render: v => `楼${v || 0}` },
    {
      title: '鍞环', dataIndex: 'selling_price', width: 90,
      render: v => <span style={{ color: '#cf1322', fontWeight: 600 }}>楼{v || 0}</span>,
    },
    {
      title: '鍒╂鼎鐜?, dataIndex: 'profit_margin', width: 80,
      render: v => <Tag color={v > 30 ? 'green' : v > 15 ? 'blue' : 'orange'}>{v || 0}%</Tag>,
    },
    { title: '绫荤洰', dataIndex: 'category', width: 120, ellipsis: true },
    {
      title: '鐘舵€?, dataIndex: 'status', width: 80,
      render: v => (
        <Tag color={v === 'listed' ? 'green' : v === 'ready' ? 'blue' : 'default'}>
          {v === 'listed' ? '宸蹭笂鏋? : v === 'ready' ? '寰呬笂鏋? : '鑽夌'}
        </Tag>
      ),
    },
    {
      title: '鎿嶄綔', width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="纭鍒犻櫎锛? onConfirm={() => handleDelete(record.id)}>
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
        <Col span={6}><Card size="small"><Statistic title="鍟嗗搧鎬绘暟" value={statsTotal} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="榛樿鍔犱环鍊嶇巼" value={`${settings.price_multiplier || 1.8}x`} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="鍥哄畾鍔犱环" value={`楼${settings.price_fixed_add || 5}`} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="榛樿绫荤洰" value={settings.default_category || '-'} valueStyle={{ fontSize: 12 }} /></Card></Col>
      </Row>

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
            <Input.Search
              placeholder="鎼滅储鍟嗗搧鍚?
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onSearch={handleSearch}
              style={{ width: 240 }}
              allowClear
            />
            <Select
              placeholder="鐘舵€佺瓫閫?
              allowClear
              value={statusFilter || undefined}
              onChange={v => setStatusFilter(v || '')}
              style={{ width: 120 }}
              options={[
                { value: 'draft', label: '鑽夌' },
                { value: 'ready', label: '寰呬笂鏋? },
                { value: 'listed', label: '宸蹭笂鏋? },
              ]}
            />
          </Space>
          <Space wrap>
            {selectedRows.length > 0 && (
              <>
                <Button icon={<DollarOutlined />} onClick={() => {
                  setBatchPriceModal(true);
                  form.resetFields();
                }}>鎵归噺鏀逛环</Button>
                <Button icon={<TagsOutlined />} onClick={() => {
                  setBatchCategoryModal(true);
                  form.resetFields();
                }}>鎵归噺鏀圭被鐩?/Button>
                <Popconfirm title={`纭鍒犻櫎 ${selectedRows.length} 涓晢鍝侊紵`} onConfirm={handleBatchDelete}>
                  <Button danger icon={<DeleteOutlined />}>鎵归噺鍒犻櫎</Button>
                </Popconfirm>
                <Button type="primary" icon={<ExportOutlined />} onClick={handleGenerateCSV}>鐢熸垚CSV涓婃灦</Button>
              </>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setEditModal({});
              form.resetFields();
            }}>鎵嬪姩娣诲姞鍟嗗搧</Button>
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
            showTotal: t => `鍏?${t} 涓晢鍝乣,
            onChange: (p) => { setPage(p); fetchData(p); },
          }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Edit/Create Modal */}
      <Modal
        title={editModal?.id ? '缂栬緫鍟嗗搧' : '娣诲姞鍟嗗搧'}
        open={!!editModal}
        onOk={handleSave}
        onCancel={() => setEditModal(null)}
        width={680}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="鍟嗗搧鏍囬" rules={[{ required: true }]}>
            <Input placeholder="娣樺疂鍟嗗搧鏍囬锛堝缓璁?0瀛椾互涓婂惈鍏抽敭璇嶏級" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="cost_price" label="鎴愭湰浠凤紙鍏冿級" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="鎷胯揣鎴愭湰" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="selling_price" label="鍞环锛堝厓锛?>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="鑷姩璁＄畻" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="娣樺疂绫荤洰">
                <Input placeholder={settings.default_category || '绫荤洰'} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="tags" label="鏍囩">
            <Input placeholder="濡傦細鍏荤敓銆佹场鑼躲€佺叢姹? />
          </Form.Item>
          <Form.Item name="description" label="鍟嗗搧鎻忚堪">
            <Input.TextArea rows={3} placeholder="鍟嗗搧璇︽儏鎻忚堪" />
          </Form.Item>
          <Form.Item name="images" label="鍟嗗搧鍥剧墖URL" help="姣忚涓€涓浘鐗囬摼鎺ワ紝鐢ㄤ簬CSV瀵煎嚭">
            <Input.TextArea rows={3} placeholder={"https://img.example.com/1.jpg\nhttps://img.example.com/2.jpg"} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Batch Price Modal */}
      <Modal
        title="鎵归噺鏀逛环"
        open={batchPriceModal}
        onOk={handleBatchPrice}
        onCancel={() => setBatchPriceModal(false)}
      >
        <p>灏嗕负閫変腑鐨?{selectedRows.length} 涓晢鍝侀噸鏂拌绠楀敭浠?/p>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="multiplier" label="鍔犱环鍊嶇巼" initialValue={parseFloat(settings.price_multiplier) || 1.8}>
                <InputNumber min={1} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fixed_add" label="鍥哄畾鍔犱环锛堝厓锛? initialValue={parseFloat(settings.price_fixed_add) || 5}>
                <InputNumber min={0} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Batch Category Modal */}
      <Modal
        title="鎵归噺淇敼绫荤洰"
        open={batchCategoryModal}
        onOk={handleBatchCategory}
        onCancel={() => setBatchCategoryModal(false)}
      >
        <p>灏嗕负閫変腑鐨?{selectedRows.length} 涓晢鍝佽缃粺涓€绫荤洰</p>
        <Form form={form} layout="vertical">
          <Form.Item name="batch_category" label="娣樺疂绫荤洰" rules={[{ required: true }]}>
            <Input placeholder={settings.default_category || '涓嵂鏉?涓嵂楗墖'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

