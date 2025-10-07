import { Injectable, BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';

// Basic config stuff for the flash sale
interface FlashSaleConfig {
  startTime: Date;
  endTime: Date;
  totalStock: number;
}

// What each purchase request looks like when it hits the queue
interface PurchaseRequest {
  userId: string;
  timestamp: number;
  resolve: (value: any) => void;  // Call this when it works
  reject: (reason: any) => void;  // Call this when it fails
}

// Circuit breaker - basically stops accepting requests when things go bad
// Explanation:
// CLOSED (normal) → All requests accepted
// Failures accumulate → handleFailure() increments failure count
// Threshold exceeded (5 failures) → Circuit OPENS
// OPEN → Fast-fail all requests for 30 seconds
// Timeout expires → Transition to HALF_OPEN
// HALF_OPEN → Allow ONE test request
// ✅ Success → Back to CLOSED
// ❌ Failure → Back to OPEN

interface CircuitBreakerState {
  failures: number;           // How many times we've failed recently
  lastFailureTime: number;    // When the last failure happened
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';  // Is it working or not?
}

/**
 * Flash Sale Service - Where All The Magic Happens
 * 
 * Alright, so here's how I built this thing to handle thousands of people
 * trying to buy stuff at once without everything exploding:
 * 
 * THE MAIN IDEAS:
 * 
 * 1. EVERYTHING GOES THROUGH A QUEUE
 *    - I put all purchase requests in a line (FIFO queue)
 *    - Process them one batch at a time
 *    - This stops race conditions where two people buy the same last item
 * 
 * 2. RATE LIMITING SO PEOPLE DON'T SPAM
 *    - Max 10 requests per minute per user
 *    - Keeps bots from overwhelming everything
 *    - Sliding window so it's fair
 * 
 * 3. CIRCUIT BREAKER FOR WHEN THINGS GO WRONG
 *    - If we get too many errors, stop accepting requests temporarily
 *    - Prevents the whole system from melting down
 *    - Auto-recovers when things calm down
 * 
 * 4. METRICS SO I CAN SEE WHAT'S HAPPENING
 *    - Track everything: success rate, queue size, processing time
 *    - Helps with debugging and optimization
 */
@Injectable()
export class AppService {
  // Flash sale config and current state
  private flashSaleConfig: FlashSaleConfig;
  private availableStock: number;

  // Keep track of who bought what and when
  private userPurchases: Map<string, { timestamp: number; success: boolean }>;

  private readonly processingLock: boolean = false;

  // THE QUEUE - This is how I handle thousands of concurrent requests
  private readonly purchaseQueue: PurchaseRequest[] = [];
  private readonly maxQueueSize: number = 10000;  // Don't let it grow forever
  private isProcessingQueue: boolean = false;     // Only one processor at a time

  // RATE LIMITING - Stop people from spamming
  private readonly userRequestTimestamps: Map<string, number[]> = new Map();
  private readonly maxRequestsPerMinute: number = 10;

  // CIRCUIT BREAKER - Protection when things go bad
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  };
  private readonly failureThreshold: number = 5;      // Open after 5 failures
  private readonly resetTimeout: number = 30000;     // Try again after 30 seconds

  // METRICS
  private metrics = {
    totalRequests: 0,
    successfulPurchases: 0,
    failedPurchases: 0,
    queuedRequests: 0,
    averageProcessingTime: 0,
    peakQueueSize: 0,
  };

  // SNAPSHOTS - For recovery if something crashes (not fully implemented yet)
  private lastSnapshotTime: number = Date.now();
  private readonly snapshotInterval: number = 5000;

  constructor() {
    // Start with a sale that's already active
    // In real life this would come from a database
    const now = new Date();
    const endTime = new Date(now.getTime() + 60 * 60 * 1000);  // Runs for 1 hour

    this.flashSaleConfig = {
      startTime: new Date(now.getTime() - 60000), // Started a minute ago
      endTime: endTime,
      totalStock: 100,
    };

    this.availableStock = this.flashSaleConfig.totalStock;
    this.userPurchases = new Map();

    // Start the background workers
    this.startQueueProcessor();
    this.startSnapshotting();
  }

  /**
   * Get the current status of the flash sale
   * 
   * This is what clients call to see if the sale is active, how many items
   * are left, etc. Pretty straightforward.
   */
  getFlashSaleStatus() {
    const now = new Date();

    // Figure out what phase we're in
    let status: 'upcoming' | 'active' | 'ended';
    if (now < this.flashSaleConfig.startTime) {
      status = 'upcoming';
    } else if (now > this.flashSaleConfig.endTime) {
      status = 'ended';
    } else {
      status = 'active';
    }

    return {
      status,
      startTime: this.flashSaleConfig.startTime,
      endTime: this.flashSaleConfig.endTime,
      totalStock: this.flashSaleConfig.totalStock,
      availableStock: this.availableStock,
      soldOut: this.availableStock === 0,
      queueLength: this.purchaseQueue.length,
      systemHealth: this.getSystemHealth(),
    };
  }

  /**
   * Try to buy something - The main function everyone calls
   * 
   * This goes through a bunch of checks before actually queuing the purchase:
   * 1. Is the circuit breaker open? (system protection)
   * 2. Is this user spamming? (rate limit check)
   * 3. Quick validation (timing, duplicates, stock)
   * 4. Queue it up for processing
   */
  async attemptPurchase(userId: string): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Check 1: Circuit breaker - if system is failing, reject fast
      if (this.circuitBreaker.state === 'OPEN') {
        const now = Date.now();
        if (now - this.circuitBreaker.lastFailureTime > this.resetTimeout) {
          this.circuitBreaker.state = 'HALF_OPEN';  // Try one request
        } else {
          throw new ServiceUnavailableException('System is temporarily unavailable. Please try again later.');
        }
      }

      // Check 2: Rate limiting - don't let users spam
      if (!this.checkRateLimit(userId)) {
        throw new BadRequestException('Too many requests. Please slow down.');
      }

      // Check 3: Quick validations before we queue
      const now = new Date();
      if (now < this.flashSaleConfig.startTime) {
        throw new BadRequestException('Flash sale has not started yet');
      }
      if (now > this.flashSaleConfig.endTime) {
        throw new BadRequestException('Flash sale has ended');
      }

      // Did they already buy something?
      const existingPurchase = this.userPurchases.get(userId);
      if (existingPurchase?.success) {
        throw new ConflictException('You have already purchased this item');
      }

      // Any stock left?
      if (this.availableStock <= 0) {
        throw new BadRequestException('Product is sold out');
      }

      // All good - queue it for processing
      const result = await this.queuePurchaseRequest(userId);

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(processingTime);

      // Reset circuit breaker if we succeeded
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failures = 0;
      }

      return result;
    } catch (error) {
      // Something went wrong - track it
      this.handleFailure();
      throw error;
    }
  }

  /**
   * Add a purchase request to the queue
   * 
   * Instead of processing purchases immediately (which causes race conditions),
   * I queue them up. The background processor handles them atomically.
   */
  private async queuePurchaseRequest(userId: string): Promise<{ success: boolean; message: string }> {
    // Don't let the queue grow forever
    if (this.purchaseQueue.length >= this.maxQueueSize) {
      throw new ServiceUnavailableException('System is overloaded. Please try again later.');
    }

    // Return a Promise that the queue processor will resolve
    return new Promise((resolve, reject) => {
      this.purchaseQueue.push({
        userId,
        timestamp: Date.now(),
        resolve,
        reject,
      });

      // Track queue stats
      this.metrics.queuedRequests++;
      if (this.purchaseQueue.length > this.metrics.peakQueueSize) {
        this.metrics.peakQueueSize = this.purchaseQueue.length;
      }

      // Wake up the processor if it's sleeping
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Background worker that constantly checks the queue
   * 
   * Runs every 10ms to keep latency low. If there's stuff in the queue
   * and no processor running, it starts processing.
   */
  private async startQueueProcessor() {
    setInterval(() => {
      if (this.purchaseQueue.length > 0 && !this.isProcessingQueue) {
        this.processQueue();
      }
    }, 10);
  }

  /**
   * Process the queue in batches
   * 
   * This is the critical part - only ONE of these runs at a time to prevent
   * race conditions. Processes up to 50 requests per batch for good throughput.
   */
  private async processQueue() {
    // Make sure only one processor runs (super important!)
    // Eliminate race conditions where two users could decrement stock simultaneously.
    if (this.isProcessingQueue || this.purchaseQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Grab a batch to process
      const batchSize = Math.min(50, this.purchaseQueue.length);
      const batch = this.purchaseQueue.splice(0, batchSize);

      // Process each one
      for (const request of batch) {
        try {
          const result = await this.processPurchaseAtomic(request.userId);
          request.resolve(result); // Success!
        } catch (error) {
          request.reject(error); // Failed
        }
      }
    } finally {
      this.isProcessingQueue = false;

      // Keep going if there's more to process
      if (this.purchaseQueue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  /**
   * Actually process the purchase - This is atomic!
   * 
   * This is where I decrement stock and record the purchase. Everything here
   * happens as one atomic operation to prevent overselling.
   */
  // Single processor → Only one processQueue() runs (enforced by isProcessingQueue flag)
  // JavaScript single-threaded → No preemption during execution
  // Re-validation → Double-check stock INSIDE the atomic section

  private async processPurchaseAtomic(userId: string): Promise<{ success: boolean; message: string }> {
    // Re-check everything (things might have changed while waiting in queue)
    const now = new Date();

    // Okay so here's the thing - even though we checked this stuff BEFORE queuing,
    // we gotta check again here. Why? Because the request might have sat in the queue
    // for a bit, and things could've changed while it was waiting its turn.
    // This is called "optimistic validation" - we do quick checks early to fail fast,
    // then re-validate right before the actual operation.

    // Check 1: Did the sale end while this was in the queue?
    if (now > this.flashSaleConfig.endTime) {
      this.metrics.failedPurchases++;
      throw new BadRequestException('Flash sale has ended');
    }

    // Check 2: Did they somehow sneak in another successful purchase while this was queued?
    // Shouldn't happen, but better safe than sorry
    const existingPurchase = this.userPurchases.get(userId);
    if (existingPurchase?.success) {
      this.metrics.failedPurchases++;
      throw new ConflictException('You have already purchased this item');
    }

    // Check 3: Did we run out of stock while this was waiting?
    // This is the most important one - prevents overselling
    if (this.availableStock <= 0) {
      this.metrics.failedPurchases++;
      throw new BadRequestException('Product is sold out');
    }

    // THE CRITICAL PART - These two lines must happen together
    this.availableStock--;
    this.userPurchases.set(userId, {
      timestamp: Date.now(),
      success: true,
    });

    this.metrics.successfulPurchases++;

    return {
      success: true,
      message: 'Purchase successful! You have secured your item.',
    };
  }

  /**
   * Rate limiting check using sliding window
   * 
   * I keep track of when each user made requests. If they're over the limit,
   * reject them. Old timestamps get cleaned up automatically.
   */
  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const userTimestamps = this.userRequestTimestamps.get(userId) || [];

    // Remove timestamps older than 1 minute
    const recentTimestamps = userTimestamps.filter(ts => now - ts < 60000);

    // Over the limit?
    // Store timestamps → Each user gets an array of request times
    // Check request → Filter timestamps from last 60 seconds
    // Enforce limit → Reject if ≥ 10 recent requests
    // Cleanup → Remove old timestamps to prevent memory leaks

    if (recentTimestamps.length >= this.maxRequestsPerMinute) {
      return false;
    }

    // Add this request and save
    recentTimestamps.push(now);
    this.userRequestTimestamps.set(userId, recentTimestamps);

    // Clean up if the map gets too big
    if (this.userRequestTimestamps.size > 10000) {
      this.cleanupRateLimitCache();
    }

    return true;
  }

  /**
   * Clean up old rate limit data
   *
   * Remove users who haven't made requests recently to prevent memory leaks.
   */
  private cleanupRateLimitCache() {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    this.userRequestTimestamps.forEach((timestamps, userId) => {
      const recentTimestamps = timestamps.filter(ts => now - ts < 60000);
      if (recentTimestamps.length === 0) {
        entriesToDelete.push(userId);
      } else {
        this.userRequestTimestamps.set(userId, recentTimestamps);
      }
    });

    entriesToDelete.forEach(userId => this.userRequestTimestamps.delete(userId));
  }

  /**
   * Handle failures and update circuit breaker
   * 
   * If we get too many failures, open the circuit breaker to protect the system.
   */
  private handleFailure() {
    this.metrics.failedPurchases++;
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    // Too many failures? Open the circuit
    if (this.circuitBreaker.failures >= this.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
    }
  }

  /**
   * Update rolling average of processing time
   */
  private updateAverageProcessingTime(newTime: number) {
    const totalRequests = this.metrics.totalRequests;
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime * (totalRequests - 1) + newTime) / totalRequests;
  }

  /**
   * Figure out if the system is healthy
   * 
   * Based on queue size and circuit breaker state.
   */
  private getSystemHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const queueUtilization = this.purchaseQueue.length / this.maxQueueSize;
    const circuitOpen = this.circuitBreaker.state === 'OPEN';

    if (circuitOpen || queueUtilization > 0.9) {
      return 'unhealthy';
    } else if (queueUtilization > 0.5 || this.circuitBreaker.state === 'HALF_OPEN') {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Start periodic snapshots (disaster recovery)
   * 
   * Not fully implemented yet, but the idea is to save state periodically.
   */
  private startSnapshotting() {
    setInterval(() => {
      this.createSnapshot();
    }, this.snapshotInterval);
  }

  /**
   * Create a state snapshot
   */
  private createSnapshot() {
    this.lastSnapshotTime = Date.now();
    // TODO: In production, persist userPurchases, availableStock, etc.
  }

  /**
   * Check if a user bought something
   */
  checkUserPurchase(userId: string): { purchased: boolean; message: string; timestamp?: number } {
    const purchase = this.userPurchases.get(userId);
    const hasPurchased = purchase?.success || false;

    return {
      purchased: hasPurchased,
      message: hasPurchased
        ? 'You have successfully secured an item'
        : 'You have not purchased an item yet',
      timestamp: purchase?.timestamp,
    };
  }

  /**
   * Get all the performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentQueueSize: this.purchaseQueue.length,
      circuitBreakerState: this.circuitBreaker.state,
      activeUsers: this.userPurchases.size,
      successRate: this.metrics.totalRequests > 0
        ? (this.metrics.successfulPurchases / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Health check endpoint
   */
  getHealthCheck() {
    return {
      status: this.getSystemHealth(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      circuitBreaker: this.circuitBreaker.state,
      queueLength: this.purchaseQueue.length,
      availableStock: this.availableStock,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Helper for tests - reconfigure the flash sale
   */
  configureFlashSale(startTime: Date, endTime: Date, totalStock: number) {
    this.flashSaleConfig = { startTime, endTime, totalStock };
    this.availableStock = totalStock;
    this.userPurchases.clear();
    this.purchaseQueue.length = 0;

    // Reset metrics
    this.metrics = {
      totalRequests: 0,
      successfulPurchases: 0,
      failedPurchases: 0,
      queuedRequests: 0,
      averageProcessingTime: 0,
      peakQueueSize: 0,
    };
  }
}
