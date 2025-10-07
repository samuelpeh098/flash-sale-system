import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Mock window.matchMedia BEFORE importing App
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock fetch globally
global.fetch = jest.fn();

import App from './App';

describe('Flash Sale Frontend', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper to mock both API calls that happen on mount
  const mockSuccessfulApis = (statusData: any) => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => statusData,
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  };

  it('renders the main title', async () => {
    mockSuccessfulApis({
      status: 'active',
      totalStock: 100,
      availableStock: 50,
      soldOut: false,
      startTime: '',
      endTime: '',
      queueLength: 0,
      systemHealth: 'healthy',
    });

    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText('🔥 Flash Sale')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('displays sale status when loaded', async () => {
    mockSuccessfulApis({
      status: 'active',
      totalStock: 100,
      availableStock: 75,
      soldOut: false,
      startTime: '',
      endTime: '',
      queueLength: 5,
      systemHealth: 'healthy',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Total Items')).toBeInTheDocument();
      expect(screen.getByText('75')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows purchase form', async () => {
    mockSuccessfulApis({
      status: 'active',
      totalStock: 100,
      availableStock: 50,
      soldOut: false,
      startTime: '',
      endTime: '',
      queueLength: 0,
      systemHealth: 'healthy',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter your user ID/i)).toBeInTheDocument();
      expect(screen.getByText('Buy Now')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('displays error when backend is down', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load sale status')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows sold out message when no stock', async () => {
    mockSuccessfulApis({
      status: 'active',
      totalStock: 100,
      availableStock: 0,
      soldOut: true,
      startTime: '',
      endTime: '',
      queueLength: 0,
      systemHealth: 'healthy',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sold Out')).toBeInTheDocument();
    }, { timeout: 3000 });

    const buyButton = screen.getByText('Buy Now');
    expect(buyButton).toBeDisabled();
  });

  it('shows sale not active warning', async () => {
    mockSuccessfulApis({
      status: 'ended',
      totalStock: 100,
      availableStock: 10,
      soldOut: false,
      startTime: '',
      endTime: '',
      queueLength: 0,
      systemHealth: 'healthy',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sale Not Active')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});