import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Alert, Statistic, Row, Col, Typography, Space, Spin, Tabs } from 'antd';
import { ShoppingCartOutlined, UserOutlined, ClockCircleOutlined, SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import './App.css';

const { Title } = Typography;

interface SaleStatus {
  status: string;
  totalStock: number;
  availableStock: number;
  soldOut: boolean;
  startTime: string;
  endTime: string;
  queueLength: number;
  systemHealth: string;
}

interface PurchaseResponse {
  success: boolean;
  message: string;
  alreadyPurchased?: boolean;
}

interface PurchaseStatusResponse {
  purchased: boolean;
  message: string;
  timestamp?: number;
}

function App() {
  const [saleStatus, setSaleStatus] = useState<SaleStatus | null>(null);
  const [userId, setUserId] = useState('');
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResponse | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusCheckLoading, setStatusCheckLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [statusCheckUserId, setStatusCheckUserId] = useState('');

  const API_BASE = 'http://localhost:3001/flash-sale';

  const fetchSaleStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      setSaleStatus(data);
    } catch (error) {
      console.error('Failed to fetch sale status:', error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!userId.trim()) {
      setPurchaseResult({ success: false, message: 'Please enter a user ID' });
      return;
    }

    setLoading(true);
    setPurchaseResult(null);

    try {
      const response = await fetch(`${API_BASE}/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userId.trim() }),
      });
      
      const data = await response.json();
      setPurchaseResult(data);
      
      // Refresh sale status after purchase attempt
      fetchSaleStatus();
    } catch (error) {
      setPurchaseResult({ 
        success: false, 
        message: 'Failed to process purchase. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const checkPurchaseStatus = async (userIdToCheck?: string) => {
    const targetUserId = userIdToCheck || statusCheckUserId.trim();
    
    if (!targetUserId) {
      setPurchaseStatus({ purchased: false, message: 'Please enter a user ID or select from the list' });
      return;
    }

    setStatusCheckLoading(true);
    setPurchaseStatus(null);
    setSelectedUser(targetUserId);

    try {
      const response = await fetch(`${API_BASE}/purchase/${encodeURIComponent(targetUserId)}`);
      const data = await response.json();
      setPurchaseStatus(data);
    } catch (error) {
      setPurchaseStatus({ 
        purchased: false, 
        message: 'Failed to check purchase status. Please try again.' 
      });
    } finally {
      setStatusCheckLoading(false);
    }
  };

  useEffect(() => {
    fetchSaleStatus();
    // Refresh status every 5 seconds
    const interval = setInterval(() => {
      fetchSaleStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const getSaleStatusColor = () => {
    if (!saleStatus) return 'default';
    if (saleStatus.status !== 'active') return 'red';
    if (saleStatus.soldOut || saleStatus.availableStock === 0) return 'orange';
    return 'green';
  };

  const getSaleStatusText = () => {
    if (!saleStatus) return 'Loading...';
    if (saleStatus.status !== 'active') return 'Sale Ended';
    if (saleStatus.soldOut || saleStatus.availableStock === 0) return 'Sold Out';
    return 'Active';
  };

  return (
    <div className="App" style={{ padding: '24px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Title level={1} style={{ textAlign: 'center', marginBottom: '32px' }}>
          🔥 Flash Sale
        </Title>

        {/* Sale Status Card */}
        <Card title="Sale Status" style={{ marginBottom: '24px' }}>
          {statusLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Spin size="large" />
            </div>
          ) : saleStatus ? (
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="Status"
                  value={getSaleStatusText()}
                  valueStyle={{ color: getSaleStatusColor() === 'green' ? '#3f8600' : getSaleStatusColor() === 'orange' ? '#cf1322' : '#8c8c8c' }}
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Total Items"
                  value={saleStatus.totalStock}
                  prefix={<ShoppingCartOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Items Sold"
                  value={saleStatus.totalStock - saleStatus.availableStock}
                  valueStyle={{ color: '#3f8600' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Remaining"
                  value={saleStatus.availableStock}
                  valueStyle={{ color: saleStatus.availableStock > 0 ? '#1890ff' : '#cf1322' }}
                />
              </Col>
            </Row>
          ) : (
            <Alert message="Failed to load sale status" type="error" />
          )}
        </Card>

        {/* Main Content Tabs */}
        <Tabs
          defaultActiveKey="purchase"
          items={[
            {
              key: 'purchase',
              label: 'Make Purchase',
              children: (
                <Card>
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Input
                      size="large"
                      placeholder="Enter your user ID (e.g., username or email)"
                      prefix={<UserOutlined />}
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      onPressEnter={handlePurchase}
                    />
                    
                    <Button
                      type="primary"
                      size="large"
                      icon={<ShoppingCartOutlined />}
                      onClick={handlePurchase}
                      loading={loading}
                      disabled={saleStatus?.status !== 'active' || saleStatus?.availableStock === 0}
                      block
                    >
                      {loading ? 'Processing...' : 'Buy Now'}
                    </Button>

                    {purchaseResult && (
                      <Alert
                        message={purchaseResult.success ? 'Purchase Successful!' : 'Purchase Failed'}
                        description={purchaseResult.message}
                        type={purchaseResult.success ? 'success' : 'error'}
                        showIcon
                      />
                    )}

                    {saleStatus && saleStatus.status !== 'active' && (
                      <Alert
                        message="Sale Not Active"
                        description="The flash sale has ended or hasn't started yet."
                        type="warning"
                        showIcon
                      />
                    )}

                    {saleStatus && saleStatus.status === 'active' && saleStatus.availableStock === 0 && (
                      <Alert
                        message="Sold Out"
                        description="All items have been sold. Better luck next time!"
                        type="info"
                        showIcon
                      />
                    )}
                  </Space>
                </Card>
              ),
            },
            {
              key: 'status',
              label: 'Check Purchase Status',
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  <Card title="Check Individual Purchase">
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                      <Input
                        size="large"
                        placeholder="Enter user ID to check purchase status"
                        prefix={<UserOutlined />}
                        value={statusCheckUserId}
                        onChange={(e) => setStatusCheckUserId(e.target.value)}
                        onPressEnter={() => checkPurchaseStatus()}
                      />
                      
                      <Button
                        size="large"
                        icon={<SearchOutlined />}
                        onClick={() => checkPurchaseStatus()}
                        loading={statusCheckLoading}
                        block
                      >
                        {statusCheckLoading ? 'Checking...' : 'Check Purchase Status'}
                      </Button>

                      {purchaseStatus && (
                        <Alert
                          message={
                            purchaseStatus.purchased 
                              ? `Purchase Found for ${selectedUser}!` 
                              : `No Purchase Found for ${selectedUser}`
                          }
                          description={
                            purchaseStatus.purchased && purchaseStatus.timestamp
                              ? `${purchaseStatus.message} (Purchased on: ${new Date(purchaseStatus.timestamp).toLocaleString()})`
                              : purchaseStatus.message
                          }
                          type={purchaseStatus.purchased ? 'success' : 'info'}
                          showIcon
                        />
                      )}
                    </Space>
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

export default App;
