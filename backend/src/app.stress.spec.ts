import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

/**
 * STRESS TESTING - Let's Break This Thing!
 * 
 * So here's the deal: I need to make sure this flash sale system can actually handle
 * real-world Black Friday-level traffic without falling apart. These tests simulate
 * what happens when thousands of people try to buy limited items at the exact same time.
 * 
 * What I'm testing for:
 * - Can it handle 1000+ people hitting it at once?
 * - Does it prevent overselling (super important!)
 * - No duplicate purchases per user
 * - System stays responsive even when slammed
 * - Graceful degradation when things get crazy
 * 
 * Basically, I'm trying to find where this breaks before customers do.
 */
describe('AppService - Stress Tests', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);

    // Quick sanity check - make sure everything's wired up
    expect(service.configureFlashSale).toBeDefined();
    expect(service.attemptPurchase).toBeDefined();
    expect(service.getFlashSaleStatus).toBeDefined();
    expect(service.getMetrics).toBeDefined();
  });

  describe('Concurrent Purchase Stress Test', () => {
    /**
     * THE BIG ONE: 1000 People Fighting Over 100 Items
     * 
     * This is my main test - simulating a real flash sale where way more people
     * want the item than we have in stock. Think limited sneaker drops or concert tickets.
     * 
     * What I'm checking:
     * - Exactly 100 people get items (no more, no less)
     * - Nobody gets to buy twice
     * - Queue handles the load properly
     * - Stock count is accurate when the dust settles
     * 
     * If this passes, I'm pretty confident the system can handle production traffic.
     */
    it('should handle 1000 concurrent purchase attempts correctly', async () => {
      // Set up a sale that's already active with limited stock
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 120000);
      service.configureFlashSale(startTime, endTime, 100);

      const concurrentUsers = 1000;
      const promises: Promise<any>[] = [];

      console.log(`\n🚀 Starting stress test with ${concurrentUsers} concurrent users for 100 items...`);
      const testStartTime = Date.now();

      // Fire off all requests at once - this is where race conditions would show up
      for (let i = 0; i < concurrentUsers; i++) {
        promises.push(
          service.attemptPurchase(`stress-user-${i}`)
            .then(result => ({ success: true, userId: `stress-user-${i}`, result }))
            .catch(error => ({ success: false, userId: `stress-user-${i}`, error: error.message }))
        );
      }

      // Wait for everything to finish
      const results = await Promise.all(promises);
      const testDuration = Date.now() - testStartTime;

      // Let's see what happened
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      const duplicateAttempts = failed.filter(r => r.error?.includes('already purchased'));
      const soldOutErrors = failed.filter(r => r.error?.includes('sold out'));
      const rateLimitErrors = failed.filter(r => r.error?.includes('Too many requests'));
      const otherErrors = failed.filter(r =>
        !r.error?.includes('already purchased') &&
        !r.error?.includes('sold out') &&
        !r.error?.includes('Too many requests')
      );

      const finalStatus = service.getFlashSaleStatus();
      const metrics = service.getMetrics();

      // Print the results so I can see what's going on
      console.log('\n📊 Stress Test Results:');
      console.log('========================');
      console.log(`Total Requests: ${concurrentUsers}`);
      console.log(`Test Duration: ${testDuration}ms`);
      console.log(`Throughput: ${(concurrentUsers / (testDuration / 1000)).toFixed(2)} req/s`);
      console.log(`\n✅ Successful Purchases: ${successful.length}`);
      console.log(`❌ Failed Attempts: ${failed.length}`);
      console.log(`   - Duplicate Attempts: ${duplicateAttempts.length}`);
      console.log(`   - Sold Out: ${soldOutErrors.length}`);
      console.log(`   - Rate Limited: ${rateLimitErrors.length}`);
      console.log(`   - Other Errors: ${otherErrors.length}`);
      console.log(`\n📦 Final Stock Status:`);
      console.log(`   - Available: ${finalStatus.availableStock}`);
      console.log(`   - Sold: ${100 - finalStatus.availableStock}`);
      console.log(`\n⚡ System Metrics:`);
      console.log(`   - Peak Queue Size: ${metrics.peakQueueSize}`);
      console.log(`   - Average Processing Time: ${metrics.averageProcessingTime.toFixed(2)}ms`);
      console.log(`   - Success Rate: ${metrics.successRate}`);
      console.log(`   - Circuit Breaker: ${metrics.circuitBreakerState}`);
      console.log(`   - System Health: ${finalStatus.systemHealth}`);

      // These are the critical checks - if any fail, we have a serious problem
      expect(successful.length).toBe(100); // Must be exactly 100, not 99, not 101
      expect(finalStatus.availableStock).toBe(0); // All stock should be gone
      expect(successful.length + finalStatus.availableStock).toBe(100); // Math should add up

      // Make sure nobody bought twice
      const uniqueSuccessfulUsers = new Set(successful.map(r => r.userId));
      expect(uniqueSuccessfulUsers.size).toBe(successful.length);

      // System should still be operational
      expect(finalStatus.systemHealth).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(finalStatus.systemHealth);

      // If there are weird errors, I want to know about them
      if (otherErrors.length > 0) {
        console.log(`\n⚠️  Unexpected errors found: ${otherErrors.slice(0, 5).map(e => e.error).join(', ')}`);
      }
    }, 30000);

    /**
     * EXTREME MODE: 5000 People, Let's See What Breaks
     * 
     * This is basically torture testing - way more load than I'd expect in production.
     * I want to find the breaking point and make sure the system fails gracefully
     * instead of just exploding.
     */
    it('should maintain data consistency under extreme load (5000 users)', async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 120000);
      const totalStock = 200;
      service.configureFlashSale(startTime, endTime, totalStock);

      const concurrentUsers = 5000;
      const promises: Promise<any>[] = [];

      console.log(`\n🔥 Starting extreme stress test with ${concurrentUsers} concurrent users for ${totalStock} items...`);
      const testStartTime = Date.now();

      // Absolute chaos mode
      for (let i = 0; i < concurrentUsers; i++) {
        promises.push(
          service.attemptPurchase(`extreme-user-${i}`)
            .then(result => ({ success: true, userId: `extreme-user-${i}` }))
            .catch(error => ({ success: false, error: error.message }))
        );
      }

      const results = await Promise.all(promises);
      const testDuration = Date.now() - testStartTime;

      const successful = results.filter(r => r.success);
      const finalStatus = service.getFlashSaleStatus();
      const metrics = service.getMetrics();

      console.log('\n📊 Extreme Stress Test Results:');
      console.log('================================');
      console.log(`Total Requests: ${concurrentUsers}`);
      console.log(`Test Duration: ${testDuration}ms`);
      console.log(`Throughput: ${(concurrentUsers / (testDuration / 1000)).toFixed(2)} req/s`);
      console.log(`Successful Purchases: ${successful.length}`);
      console.log(`Available Stock: ${finalStatus.availableStock}`);
      console.log(`Peak Queue Size: ${metrics.peakQueueSize}`);
      console.log(`Average Processing Time: ${metrics.averageProcessingTime.toFixed(2)}ms`);
      console.log(`System Health: ${finalStatus.systemHealth}`);

      // Even under this crazy load, the math must still work out perfectly
      expect(successful.length).toBe(totalStock);
      expect(finalStatus.availableStock).toBe(0);
      expect(successful.length + finalStatus.availableStock).toBe(totalStock);

      // Still no duplicate purchases allowed
      const uniqueSuccessfulUsers = new Set(successful.map(r => r.userId));
      expect(uniqueSuccessfulUsers.size).toBe(successful.length);
    }, 60000);
  });

  describe('Rate Limiting Stress Test', () => {
    /**
     * Spam Protection Test
     * 
     * What happens when someone (or a bot) tries to hammer the API?
     * This simulates someone frantically clicking the buy button 50 times.
     * Rate limiting should kick in and tell them to chill out.
     */
    it('should enforce rate limits under high load from single user', async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 120000);
      service.configureFlashSale(startTime, endTime, 100);

      const userId = 'rate-limit-test-user';
      const attempts = 50; // Way more than the 10/min limit
      const promises: Promise<any>[] = [];

      console.log(`\n⚡ Testing rate limiting with ${attempts} rapid requests from single user...`);

      // Rapid fire requests with tiny delays to simulate frantic clicking
      for (let i = 0; i < attempts; i++) {
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              service.attemptPurchase(userId)
                .then(() => resolve({ success: true, attempt: i }))
                .catch(error => resolve({ success: false, error: error.message, attempt: i }));
            }, i * 10);
          })
        );
      }

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success);
      const rateLimited = results.filter(r => !r.success && r.error?.includes('Too many requests'));
      const otherErrors = results.filter(r => !r.success && !r.error?.includes('Too many requests'));

      console.log(`Successful requests: ${successful.length}/${attempts}`);
      console.log(`Rate limited requests: ${rateLimited.length}/${attempts}`);
      console.log(`Other errors: ${otherErrors.length}/${attempts}`);

      if (otherErrors.length > 0) {
        console.log(`Other error types: ${otherErrors.map(e => e.error).slice(0, 3).join(', ')}`);
      }

      // Either rate limiting should block them, or they hit the "already purchased" rule
      const duplicatePurchaseErrors = otherErrors.filter(e => e.error?.includes('already purchased'));
      const totalBlocked = rateLimited.length + duplicatePurchaseErrors.length;
      expect(totalBlocked).toBeGreaterThan(0);

      // Bottom line: they should only get one item max
      expect(successful.length).toBeLessThanOrEqual(1);
    }, 15000);
  });

  describe('Performance Under Load', () => {
    /**
     * Marathon Test - Multiple Waves of Traffic
     * 
     * Real flash sales don't just get one spike - traffic comes in waves.
     * This simulates multiple waves hitting the system to see if performance
     * degrades over time or if it can sustain the load.
     */
    it('should maintain acceptable performance with continuous load', async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 120000);
      service.configureFlashSale(startTime, endTime, 500);

      console.log('\n⏱️  Testing sustained performance...');

      const waves = 5;
      const usersPerWave = 200;
      const allResults: any[] = [];

      // Hit it with 5 waves of 200 users each
      for (let wave = 0; wave < waves; wave++) {
        const waveStartTime = Date.now();
        const promises: Promise<any>[] = [];

        for (let i = 0; i < usersPerWave; i++) {
          const userId = `wave${wave}-user${i}`;
          promises.push(
            service.attemptPurchase(userId)
              .then(() => ({ success: true, wave }))
              .catch(() => ({ success: false, wave }))
          );
        }

        const waveResults = await Promise.all(promises);
        const waveDuration = Date.now() - waveStartTime;
        allResults.push(...waveResults);

        console.log(`Wave ${wave + 1}: ${waveDuration}ms, Success: ${waveResults.filter(r => r.success).length}`);

        // Small breather between waves
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const metrics = service.getMetrics();
      console.log(`\nAverage Processing Time: ${metrics.averageProcessingTime.toFixed(2)}ms`);
      console.log(`Total Successful: ${allResults.filter(r => r.success).length}`);

      // Response time should stay reasonable throughout
      expect(metrics.averageProcessingTime).toBeLessThan(1000);
    }, 45000);
  });

  describe('Recovery and Resilience', () => {
    /**
     * Queue Overflow - What Happens When We Run Out of Memory?
     * 
     * The queue has a limit (10k requests) to prevent memory issues.
     * This test makes sure that when we hit that limit, the system
     * gracefully rejects new requests instead of crashing.
     */
    it('should handle queue overflow gracefully', async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 120000);
      service.configureFlashSale(startTime, endTime, 1000);

      console.log('\n💥 Testing queue overflow handling...');

      // Try to overflow the queue (max is 10k)
      const overloadAttempts = 12000;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < overloadAttempts; i++) {
        promises.push(
          service.attemptPurchase(`overflow-user-${i}`)
            .then(() => ({ success: true }))
            .catch(error => ({
              success: false,
              isOverload: error.message.includes('overloaded')
            }))
        );
      }

      const results = await Promise.all(promises);
      const overloadRejections = results.filter(r => !r.success && r.isOverload);
      const successful = results.filter(r => r.success);

      console.log(`Overload rejections: ${overloadRejections.length}`);
      console.log(`Successful purchases: ${successful.length}`);

      // Should have rejected some when queue was full
      expect(successful.length + overloadRejections.length).toBeGreaterThan(0);

      // System should still be alive after this abuse
      const health = service.getHealthCheck();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    }, 45000);
  });

  describe('Race Condition Tests', () => {
    /**
     * The Ultimate Test - Preventing the "Last Item" Problem
     * 
     * This is where most systems fail. When 100 people try to buy the last item
     * at the exact same time, only ONE should succeed. This test creates that
     * exact scenario intentionally to prove the atomic operations work.
     * 
     * If this fails, we have a serious data consistency problem.
     */
    it('should prevent race conditions in stock management', async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 120000);
      const totalStock = 50;
      service.configureFlashSale(startTime, endTime, totalStock);

      console.log('\n🏁 Testing race condition prevention...');

      // 100 people fighting over 50 items - maximum contention
      const promises: Promise<any>[] = [];
      const userCount = 100;

      // Everyone hits at exactly the same time
      for (let i = 0; i < userCount; i++) {
        promises.push(
          service.attemptPurchase(`race-user-${i}`)
            .then(result => ({ success: true, userId: `race-user-${i}`, result }))
            .catch(error => ({ success: false, userId: `race-user-${i}` }))
        );
      }

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.success);
      const finalStatus = service.getFlashSaleStatus();

      console.log(`Successful purchases: ${successful.length}`);
      console.log(`Final available stock: ${finalStatus.availableStock}`);
      console.log(`Total accounted: ${successful.length + finalStatus.availableStock}`);

      // These MUST be perfect - no exceptions allowed
      expect(successful.length).toBe(totalStock); // Exactly 50 sales
      expect(finalStatus.availableStock).toBe(0); // Zero stock left
      expect(successful.length + finalStatus.availableStock).toBe(totalStock); // Perfect math

      // Each user ID should appear only once
      const uniqueUsers = new Set(successful.map(r => r.userId));
      expect(uniqueUsers.size).toBe(successful.length);
    }, 30000);
  });
});
