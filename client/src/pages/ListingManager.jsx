import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, message, Card, Statistic, Row, Col, Modal, Descriptions, Popconfirm, Empty, Alert } from 'antd';
import {
  DownloadOutlined, CheckCircleOutlined, EyeOutlined, DeleteOutlined,
  RocketOutlined, ImportOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { getListings, getProducts, generateCSV, autoListTaobao, getAutoListStatus, updateListing, deleteListing, deleteProduct } from '../api';

export default function ListingManager() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [autoListing, setAutoListing] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [csvResult, setCsvResult] = useState(null);
  const [autoListStatus, setAutoListStatus] = useState(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      getListings({ pageSize: 100 }),
      getProducts({ pageSize: 200 }),
      getAutoListStatus().catch(() => ({ data: {} })),
    ]).then(([lRes, pRes, sRes]) => {
      setListings(lRes.data.items || []);
      setAllProducts(pRes.data.items || []);
      setAutoListStatus(sRes.data || {});
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const unlistedProducts = allProducts.filter(p => p.status !== 'listed');

  // === Auto-list to Taobao (browser automation) ===
  const handleAutoList = async (productIds) => {
    Modal.confirm({
      title: '确认自动上架',
      icon: <RocketOutlined />,
      content: (
        <div>
          <p>即将为 <strong>{productIds.length}</strong> 件商品自动上架到淘宝</p>
          <p style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
            系统将自动打开浏览器，请确保：
          </p>
          <ul style={{ color: '#999', fontSize: 12, paddingLeft: 20 }}>
            <li>已安装 Chrome 浏览器</li>
            <li>准备好在浏览器中登录淘宝（如需要扫码）</li>
            <li>图片需要在浏览器中手动上传</li>
          </ul>
        </div>
      ),
      okText: '开始上架',
      cancelText: '取消',
      onOk: async () => {
        setAutoListing(true);
        try {
          const { data } = await autoListTaobao({ productIds });
          setSelectedRowKeys([]);

          const results = data.results || [];
          const successCount = results.filter(r => r.success).length;
          const failCount = results.filter(r => !r.success).length;

          if (successCount > 0 && failCount === 0) {
            message.success(`全部 ${successCount} 件商品上架成功！`);
          } else if (successCount > 0) {
            Modal.warning({
              title: '部分上架成功',
              content: `${successCount} 件成功，${failCount} 件失败。失败原因：${results.filter(r => !r.success).map(r => r.message).slice(0, 3).join('；')}`,
            });
          } else {
            Modal.error({
              title: '上架失败',
              content: results[0]?.message || '未知错误，请检查浏览器状态',
            });
          }

          fetchData();
        } catch (err) {
          message.error('启动失败: ' + (err.response?.data?.message || err.message));
        }
        setAutoListing(false);
      },
    });
  };

  // === CSV flow ===
  const handleGenerateCSV = async () => {
    if (selectedRowKeys.length === 0) {
      return message.warning('请先勾选商品');
    }
    setGenerating(true);
    try {
      // Derive keyword from selected products' tags or category
      const selectedProds = allProducts.filter(p => selectedRowKeys.includes(p.id));
      const keyword = selectedProds[0]?.tags || selectedProds[0]?.category || '';
      const { data } = await generateCSV({ productIds: selectedRowKeys, keyword });
      setCsvResult({ fileName: data.fileName, csvPath: data.csvPath, count: data.count });
      setSelectedRowKeys([]);
      fetchData();
    } catch {
      message.error('生成失败');
    }
    setGenerating(false);
  };

  const handleDownloadCSV = () => {
    if (!csvResult) return;
    const a = document.createElement('a');
    a.href = `/api/listings/download/${csvResult.fileName}`;
    a.click();
  };

  const handleMarkListed = async (listing) => {
    await updateListing(listing.id, { status: 'listed' });
    message.success('已标记为上架');
    fetchData();
  };

  const handleDelete = async (id) => {
    await deleteListing(id);
    message.success('已删除');
    fetchData();
  };

  const handleDownload = (listing) => {
    const a = document.createElement('a');
    a.href = `/api/listings/download/${listing.csv_path?.split('/').pop()?.split('\\').pop() || ''}`;
    a.click();
  };

  const handleDeleteProduct = async (id) => {
    await deleteProduct(id);
    message.success('商品已删除');
    fetchData();
  };

  const getProductTitle = (id) => {
    const p = allProducts.find(p => p.id === id);
    return p?.title || `商品 #${id}`;
  };

  const productColumns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '商品名', dataIndex: 'title', ellipsis: true },
    { title: '来源', dataIndex: 'platform', width: 65, render: v => <Tag>{v || '-'}</Tag> },
    { title: '成本', dataIndex: 'cost_price', width: 75, render: v => `¥${v || 0}` },
    { title: '售价', dataIndex: 'selling_price', width: 75, render: v => <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{v || 0}</span> },
    { title: '利润', dataIndex: 'profit_margin', width: 65, render: v => <Tag color={v > 30 ? 'green' : 'blue'}>{v || 0}%</Tag> },
    { title: '类目', dataIndex: 'category', width: 90, ellipsis: true, render: v => v || '-' },
    {
      title: '操作', width: 210, fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button type="primary" size="small" icon={<ThunderboltOutlined />}
            onClick={() => handleAutoList([record.id])}
            loading={autoListing}
          >
            一键上架
          </Button>
          <Popconfirm title="确认删除此商品？" onConfirm={() => handleDeleteProduct(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const listingColumns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '商品', dataIndex: 'product_id', width: 160, ellipsis: true, render: v => getProductTitle(v) },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: v => <Tag color={v === 'listed' ? 'green' : 'orange'}>{v === 'listed' ? '已上架' : '待上架'}</Tag>,
    },
    { title: '淘宝ID', dataIndex: 'taobao_item_id', width: 110, render: v => v || '-' },
    { title: 'CSV', dataIndex: 'csv_path', width: 160, ellipsis: true, render: v => v ? v.split('/').pop()?.split('\\').pop() : '-' },
    { title: '创建时间', dataIndex: 'created_at', width: 140, render: v => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    {
      title: '操作', width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(record)} />
          {record.csv_path && (
            <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>下载</Button>
          )}
          {record.status !== 'listed' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleMarkListed(record)}>已上架</Button>
          )}
          <Popconfirm title="确认删除？商品恢复草稿" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const draftCount = allProducts.filter(p => p.status === 'draft').length;
  const readyCount = allProducts.filter(p => p.status === 'ready').length;
  const listedCount = allProducts.filter(p => p.status === 'listed').length;

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small"><Statistic title="草稿" value={draftCount} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="待上架" value={readyCount} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="已上架" value={listedCount} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={12}>
          <Card size="small">
            <Space wrap>
              <Button type="primary" icon={<ImportOutlined />} onClick={() => navigate('/sourcing')}>搜索选品</Button>
              <Button icon={<DownloadOutlined />} onClick={handleGenerateCSV} loading={generating} disabled={selectedRowKeys.length === 0}>
                {selectedRowKeys.length > 0 ? `导出CSV备份 (${selectedRowKeys.length})` : '导出CSV备份'}
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Alert
        message="推荐工作流：搜索选品 → 导入商品库 → 一键上架（自动填写淘宝发布页）"
        description={
          <span>
            点击「一键上架」会自动打开浏览器，登录淘宝后自动填写商品信息。
            图片需要在浏览器中手动上传，其他信息自动完成。
            {autoListStatus?.hasProfile && <Tag color="green" style={{ marginLeft: 8 }}>浏览器Profile已存在</Tag>}
          </span>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card title={`待上架商品（${unlistedProducts.length}）`} style={{ marginBottom: 16 }}>
        {unlistedProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Empty description="暂无待上架商品" />
            <Button type="primary" icon={<ImportOutlined />} onClick={() => navigate('/sourcing')} style={{ marginTop: 12 }}>
              去导入商品
            </Button>
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={productColumns}
            dataSource={unlistedProducts}
            loading={loading}
            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
            pagination={{ pageSize: 20, showTotal: t => `共 ${t} 个` }}
            scroll={{ x: 700 }}
            size="small"
          />
        )}
      </Card>

      <Card title={`上架记录（${listings.length}）`}>
        <Table
          rowKey="id"
          columns={listingColumns}
          dataSource={listings}
          loading={loading}
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }}
          scroll={{ x: 900 }}
          size="small"
        />
      </Card>

      {/* Detail modal */}
      <Modal title="上架详情" open={!!detailModal} onCancel={() => setDetailModal(null)} footer={null} width={500}>
        {detailModal && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="商品">{getProductTitle(detailModal.product_id)}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={detailModal.status === 'listed' ? 'green' : 'orange'}>
                {detailModal.status === 'listed' ? '已上架' : '待上架'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="淘宝商品ID">{detailModal.taobao_item_id || '-'}</Descriptions.Item>
            <Descriptions.Item label="CSV文件">{detailModal.csv_path?.split('/').pop()?.split('\\').pop() || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailModal.created_at ? new Date(detailModal.created_at).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
            <Descriptions.Item label="上架时间">{detailModal.listed_at ? new Date(detailModal.listed_at).toLocaleString('zh-CN') : '未上架'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* CSV result modal */}
      <Modal title={null} open={!!csvResult} onCancel={() => setCsvResult(null)} footer={null} width={560} closable={false} maskClosable>
        {csvResult && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 12 }} />
            <h2 style={{ margin: '8px 0' }}>CSV 已生成</h2>
            <p style={{ color: '#666' }}>{csvResult.count} 个商品 · {csvResult.fileName}</p>
            <Button type="primary" size="large" icon={<DownloadOutlined />} onClick={handleDownloadCSV} block style={{ marginTop: 12, marginBottom: 16 }}>
              下载 CSV 文件
            </Button>
            <Card size="small" style={{ textAlign: 'left', background: '#fffbe6', border: '1px solid #ffe58f' }}>
              <h4 style={{ margin: '0 0 8px', color: '#d48806' }}>💡 CSV说明</h4>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                CSV文件包含了商品的标题、价格、类目等信息。由于淘宝目前没有直接的CSV导入入口，
                建议使用<strong>「一键上架」</strong>功能直接在浏览器中自动填写。
              </p>
              <p style={{ fontSize: 12, color: '#999', marginBottom: 0 }}>
                CSV文件可作为商品信息备份，或在第三方上架工具中使用。
              </p>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
