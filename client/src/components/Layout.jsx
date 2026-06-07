import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu } from 'antd';
import {
  DashboardOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  ShopOutlined,
} from '@ant-design/icons';

const { Sider, Content, Header } = AntLayout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/sourcing', icon: <SearchOutlined />, label: '货源搜索' },
  { key: '/products', icon: <AppstoreOutlined />, label: '商品库' },
  { key: '/listings', icon: <UnorderedListOutlined />, label: '上架管理' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider width={200} style={{ background: '#fff' }}>
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0', fontWeight: 700, fontSize: 16, gap: 8,
        }}>
          <ShopOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          淘宝上架工具
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <AntLayout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0', fontSize: 15, fontWeight: 500 }}>
          {menuItems.find(m => m.key === location.pathname)?.label || ''}
        </Header>
        <Content style={{ margin: 24, minHeight: 280 }}>
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
