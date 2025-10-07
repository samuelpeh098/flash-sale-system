import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Integration Tests - Testing the API endpoints
 *
 * This is where I test the actual HTTP endpoints to make sure everything works together.
 * Different from unit tests - these call the real controllers and check responses.
 */
describe('AppController - Integration Tests', () => {
  let appController: AppController;
  let appService: AppService;

  // Fresh setup before each test
  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);

    // Start with 20 items, sale is active right now
    const startTime = new Date(Date.now() - 1000);
    const endTime = new Date(Date.now() + 60000);
    appService.configureFlashSale(startTime, endTime, 20);
  });

  // Test the status endpoint - users check this to see what's available
  describe('GET /status', () => {
    it('should return flash sale status', () => {
      const status = appController.getFlashSaleStatus();

      // Make sure we get all the important fields
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('availableStock');
      expect(status).toHaveProperty('totalStock');
      expect(status.totalStock).toBe(20);
    });

    it('should indicate when sale is active', () => {
      const status = appController.getFlashSaleStatus();
      expect(status.status).toBe('active');
    });

    it('should show system health information', () => {
      const status = appController.getFlashSaleStatus();
      
      // Health should be one of these three states
      expect(status).toHaveProperty('systemHealth');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(status.systemHealth);
    });
  });

  // Test the main purchase endpoint - the most important one
  describe('POST /purchase', () => {
    it('should successfully process a purchase request', async () => {
      const result = await appController.attemptPurchase('test-user-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('successful');
    });

    it('should prevent duplicate purchases', async () => {
      // First purchase should work
      await appController.attemptPurchase('test-user-2');

      // Second attempt should fail - one per customer
      await expect(appController.attemptPurchase('test-user-2'))
        .rejects
        .toThrow(ConflictException);
    });

    it('should handle multiple unique users', async () => {
      // Three different people buy
      const user1 = await appController.attemptPurchase('user-1');
      const user2 = await appController.attemptPurchase('user-2');
      const user3 = await appController.attemptPurchase('user-3');

      expect(user1.success).toBe(true);
      expect(user2.success).toBe(true);
      expect(user3.success).toBe(true);

      // Started with 20, should have 17 left
      const status = appController.getFlashSaleStatus();
      expect(status.availableStock).toBe(17);
    });

    it('should update available stock after purchase', async () => {
      const initialStatus = appController.getFlashSaleStatus();
      const initialStock = initialStatus.availableStock;

      await appController.attemptPurchase('stock-test-user');

      // Stock should decrease by exactly 1
      const updatedStatus = appController.getFlashSaleStatus();
      expect(updatedStatus.availableStock).toBe(initialStock - 1);
    });
  });

  // Check if a specific user bought something
  describe('GET /check/:userId', () => {
    it('should return purchase status for a user', async () => {
      await appController.attemptPurchase('check-user-1');

      const checkResult = appController.checkUserPurchase('check-user-1');
      expect(checkResult.purchased).toBe(true);
      expect(checkResult.timestamp).toBeDefined();
    });

    it('should return false for users who have not purchased', () => {
      const checkResult = appController.checkUserPurchase('non-existent-user');
      expect(checkResult.purchased).toBe(false);
    });
  });

  // System metrics - for monitoring and debugging
  describe('GET /metrics', () => {
    it('should return system metrics', async () => {
      // Create some activity first
      await appController.attemptPurchase('metrics-user-1');
      await appController.attemptPurchase('metrics-user-2');

      const metrics = appController.getMetrics();

      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('successfulPurchases');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics.successfulPurchases).toBeGreaterThanOrEqual(2);
    });

    it('should track queue metrics', () => {
      const metrics = appController.getMetrics();

      // Queue stats help with capacity planning
      expect(metrics).toHaveProperty('currentQueueSize');
      expect(metrics).toHaveProperty('peakQueueSize');
    });
  });

  // Health check endpoint - load balancers use this
  describe('GET /health', () => {
    it('should return health check information', () => {
      const health = appController.getHealthCheck();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('circuitBreaker');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('memoryUsage');
    });
  });

  // Full user journey from start to finish
  describe('End-to-End Purchase Flow', () => {
    it('should handle complete purchase lifecycle', async () => {
      const userId = 'e2e-test-user';

      // Step 1: User hasn't bought anything yet
      const initialCheck = appController.checkUserPurchase(userId);
      expect(initialCheck.purchased).toBe(false);

      // Step 2: User attempts to buy
      const purchaseResult = await appController.attemptPurchase(userId);
      expect(purchaseResult.success).toBe(true);

      // Step 3: Verify the purchase went through
      const finalCheck = appController.checkUserPurchase(userId);
      expect(finalCheck.purchased).toBe(true);

      // Step 4: Stock decreased correctly
      const status = appController.getFlashSaleStatus();
      expect(status.availableStock).toBeLessThan(20);
    });

    it('should maintain data consistency across operations', async () => {
      const users = ['user-a', 'user-b', 'user-c'];

      // All three users buy
      for (const userId of users) {
        await appController.attemptPurchase(userId);
      }

      // Verify each purchase is recorded
      for (const userId of users) {
        const check = appController.checkUserPurchase(userId);
        expect(check.purchased).toBe(true);
      }

      // Metrics should match reality
      const metrics = appController.getMetrics();
      expect(metrics.successfulPurchases).toBeGreaterThanOrEqual(3);
    });
  });

  // Make sure errors are handled properly
  describe('Error Handling', () => {
    it('should handle invalid purchase when sale ended', async () => {
      // Set up a sale that already finished
      const startTime = new Date(Date.now() - 20000);
      const endTime = new Date(Date.now() - 10000);
      appService.configureFlashSale(startTime, endTime, 10);

      // Too late, sale's over
      await expect(appController.attemptPurchase('late-user'))
        .rejects
        .toThrow(BadRequestException);
    });

    it('should handle sold out scenario', async () => {
      // Only 1 item left
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 60000);
      appService.configureFlashSale(startTime, endTime, 1);

      // First buyer gets it
      await appController.attemptPurchase('first-buyer');

      // Second buyer is out of luck
      await expect(appController.attemptPurchase('second-buyer'))
        .rejects
        .toThrow(BadRequestException);
    });
  });
});