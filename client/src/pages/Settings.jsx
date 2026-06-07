import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Input, Button, message, Divider } from 'antd';
import { SaveOutlined, CalculatorOutlined } from '@ant-design/icons';
import { getSettings, updateSettings } from '../api';

export default function Settings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const fetchSettings = () => {
    getSettings().then(({ data }) => {
      form.setFieldsValue({
        price_multiplier: parseFloat(data.price_multiplier) || 1.8,
        price_fixed_add: parseFloat(data.price_fixed_add) || 5,
        default_category: data.default_category || '中药材/中药饮片',
        default_freight_template: data.default_freight_template || '包邮',
      });
    });
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      await updateSettings({
        price_multiplier: String(values.price_multiplier),
        price_fixed_add: String(values.price_fixed_add),
        default_category: values.default_category,
        default_freight_template: values.default_freight_template,
      });
      message.success('设置已保存');
    } catch {
      message.error('保存失败');
    }
    setLoading(false);
  };

  const calcPreview = () => {
    const multiplier = form.getFieldValue('price_multiplier') || 1.8;
    const fixedAdd = form.getFieldValue('price_fixed_add') || 5;
    const costs = [10, 20, 50, 100, 200];
    const preview = costs.map(c => ({
      cost: c,
      price: Math.round((c * multiplier + fixedAdd) * 100) / 100,
      margin: Math.round((1 - c / (c * multiplier + fixedAdd)) * 10000) / 100,
    }));
    setPreview(preview);
  };

  return (
    <div>
      <Card title="定价规则" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Form.Item name="price_multiplier" label="加价倍率" rules={[{ required: true }]}>
            <InputNumber min={1} max={10} step={0.1} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="price_fixed_add" label="固定加价（元）" rules={[{ required: true }]}>
            <InputNumber min={0} step={1} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item>
            <Button icon={<CalculatorOutlined />} onClick={calcPreview}>预览定价</Button>
          </Form.Item>
        </Form>

        {preview && (
          <div style={{ marginTop: 16, background: '#fafafa', padding: 16, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>成本价</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>售价</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>利润率</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>利润额</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: 8 }}>¥{p.cost}</td>
                    <td style={{ padding: 8, color: '#cf1322', fontWeight: 600 }}>¥{p.price}</td>
                    <td style={{ padding: 8, color: p.margin > 30 ? '#3f8600' : '#1677ff' }}>{p.margin}%</td>
                    <td style={{ padding: 8 }}>¥{(p.price - p.cost).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Divider />

        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading} size="large">
          保存设置
        </Button>
      </Card>

      <Card title="默认值设置">
        <Form form={form} layout="vertical" style={{ maxWidth: 500 }}>
          <Form.Item name="default_category" label="默认淘宝类目">
            <Input placeholder="如：中药材/中药饮片" />
          </Form.Item>
          <Form.Item name="default_freight_template" label="默认运费模板名">
            <Input placeholder="如：包邮、满99包邮" />
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
