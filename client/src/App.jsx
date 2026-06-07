import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Sourcing from './pages/Sourcing';
import ProductLibrary from './pages/ProductLibrary';
import ListingManager from './pages/ListingManager';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sourcing" element={<Sourcing />} />
        <Route path="/products" element={<ProductLibrary />} />
        <Route path="/listings" element={<ListingManager />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
