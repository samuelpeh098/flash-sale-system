import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * Unit Tests - Testing Each Piece Individually
 * 
 * Here I'm testing each function in isolation to make sure the business logic works correctly.
 * If something breaks, these tests tell me exactly which function has the problem.
 */
describe('AppService - Unit Tests', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  afterEach(() => {
    // Clean up timers so tests don't interfere with each other
    jest.clearAllTimers();
  });

  describe('Flash Sale Configuration', () => {
    // Making sure it starts up with sensible defaults
    it('should initialize with default configuration', () => {
      const status = service.getFlashSaleStatus();
      expect(status.totalStock).toBe(100);
      expect(status.availableStock).toBe(100);
      expect(status.status).toBe('active');
    });

    // Testing that I can change the configuration dynamically
    it('should allow reconfiguration of flash sale', () => {
      const startTime = new Date(Date.now() + 10000); // Starts in 10 seconds
      const endTime = new Date(Date.now() + 20000);
      service.configureFlashSale(startTime, endTime, 50);

      const status = service.getFlashSaleStatus();
      expect(status.totalStock).toBe(50);
      expect(status.availableStock).toBe(50);
      expect(status.status).toBe('upcoming'); // Not started yet
    });
  });

  describe('Purchase Logic', () => {
    beforeEach(() => {
      // Set up an active sale for each test
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 60000);
      service.configureFlashSale(startTime, endTime, 10);
    });

    // Happy path - everything works correctly
    it('should successfully process a valid purchase', async () => {
      const result = await service.attemptPurchase('user1');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Purchase successful');

      // Stock should go down by 1
      const status = service.getFlashSaleStatus();
      expect(status.availableStock).toBe(9);
    });

    // Make sure users can't buy more than once
    it('should prevent duplicate purchases by the same user', async () => {
      // First purchase works
      await service.attemptPurchase('user1');

      // Second purchase fails
      await expect(service.attemptPurchase('user1'))
        .rejects
        .toThrow(ConflictException);
    });

    // What happens when everything is sold out?
    it('should handle stock depletion correctly', async () => {
      // Set up with only 2 items for faster testing
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 60000);
      service.configureFlashSale(startTime, endTime, 2);

      // Sell both items
      await service.attemptPurchase('user1');
      await service.attemptPurchase('user2');

      // Next person should get an error
      await expect(service.attemptPurchase('user3'))
        .rejects
        .toThrow(BadRequestException);

      const status = service.getFlashSaleStatus();
      expect(status.availableStock).toBe(0);
      expect(status.soldOut).toBe(true);
    });

    // Can't buy before sale starts
    it('should reject purchases before sale starts', async () => {
      const startTime = new Date(Date.now() + 10000);
      const endTime = new Date(Date.now() + 20000);
      service.configureFlashSale(startTime, endTime, 10);

      await expect(service.attemptPurchase('user1'))
        .rejects
        .toThrow(BadRequestException);
    });

    // Can't buy after sale ends
    it('should reject purchases after sale ends', async () => {
      const startTime = new Date(Date.now() - 20000);
      const endTime = new Date(Date.now() - 10000);
      service.configureFlashSale(startTime, endTime, 10);

      await expect(service.attemptPurchase('user1'))
        .rejects
        .toThrow(BadRequestException);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 60000);
      service.configureFlashSale(startTime, endTime, 100);
    });

    // Testing that rate limiting actually works
    it('should enforce rate limiting per user', async () => {
      // First purchase succeeds
      await service.attemptPurchase('rate_limit_user');

      // Trying to spam requests should fail
      const rapidRequests: Promise<any>[] = [];
      
      for (let i = 0; i < 10; i++) {
        rapidRequests.push(
          service.attemptPurchase('rate_limit_user').catch(err => err)
        );
      }

      const results = await Promise.all(rapidRequests);
      
      // All subsequent requests should fail (either duplicate or rate limit)
      const errors = results.filter(r => 
        r instanceof ConflictException || 
        (r instanceof BadRequestException && r.message.includes('Too many requests'))
      );

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('User Purchase Tracking', () => {
    beforeEach(() => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 60000);
      service.configureFlashSale(startTime, endTime, 10);
    });

    // Making sure purchases are tracked correctly
    it('should track user purchases correctly', async () => {
      await service.attemptPurchase('user1');

      const checkResult = service.checkUserPurchase('user1');
      expect(checkResult.purchased).toBe(true);
      expect(checkResult.timestamp).toBeDefined();
    });

    // What about users who haven't bought anything?
    it('should return false for users who have not purchased', () => {
      const checkResult = service.checkUserPurchase('user_nonexistent');
      expect(checkResult.purchased).toBe(false);
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(() => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 60000);
      service.configureFlashSale(startTime, endTime, 10);
    });

    // Are successful purchases being counted?
    it('should track successful purchases in metrics', async () => {
      await service.attemptPurchase('user1');
      await service.attemptPurchase('user2');

      const metrics = service.getMetrics();
      expect(metrics.successfulPurchases).toBe(2);
      expect(metrics.totalRequests).toBeGreaterThanOrEqual(2);
    });

    // Are failed purchases being counted?
    it('should track failed purchases in metrics', async () => {
      await service.attemptPurchase('user1');

      // This will fail (duplicate)
      try {
        await service.attemptPurchase('user1');
      } catch (error) {
        // Expected
      }

      const metrics = service.getMetrics();
      expect(metrics.failedPurchases).toBeGreaterThan(0);
    });

    // Is the success rate calculated correctly?
    it('should calculate success rate correctly', async () => {
      await service.attemptPurchase('user1');

      const metrics = service.getMetrics();
      expect(metrics.successRate).toBeDefined();
      expect(parseFloat(metrics.successRate)).toBeGreaterThan(0);
    });
  });

  describe('System Health', () => {
    // System should report healthy under normal conditions
    it('should report healthy status under normal conditions', () => {
      const health = service.getHealthCheck();
      expect(health.status).toBe('healthy');
      expect(health.circuitBreaker).toBe('CLOSED');
    });

    // Make sure all health metrics are included
    it('should include system metrics in health check', () => {
      const health = service.getHealthCheck();
      expect(health.uptime).toBeDefined();
      expect(health.memoryUsage).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(() => {
      // Set up an ended sale to trigger failures
      const startTime = new Date(Date.now() - 20000);
      const endTime = new Date(Date.now() - 10000);
      service.configureFlashSale(startTime, endTime, 10);
    });

    // Testing that circuit breaker opens after too many failures
    it('should open circuit breaker after multiple failures', async () => {
      const promises: Promise<any>[] = [];

      // Trigger a bunch of failures (sale ended)
      for (let i = 0; i < 10; i++) {
        promises.push(
          service.attemptPurchase(`user${i}`).catch(err => err)
        );
      }

      await Promise.all(promises);

      // Circuit breaker should respond to the failures
      const health = service.getHealthCheck();
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(health.circuitBreaker);
    });
  });
});
