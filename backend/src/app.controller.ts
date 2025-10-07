import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * Flash Sale API - The Public Interface
 */
@Controller('flash-sale')
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * GET /flash-sale/status
   *
   * Quick status check - is the sale active? How many items left?
   */
  @Get('status')
  getFlashSaleStatus() {
    return this.appService.getFlashSaleStatus();
  }

  /**
   * POST /flash-sale/purchase
   *
   * The main event - trying to buy an item. This is where all the
   * concurrency magic happens behind the scenes.
   */
  @Post('purchase')
  attemptPurchase(@Body('userId') userId: string) {
    // Quick sanity check
    if (!userId) {
      return { success: false, message: 'userId is required' };
    }
    return this.appService.attemptPurchase(userId);
  }

  /**
   * GET /flash-sale/purchase/:userId
   *
   * Did this user successfully buy something? Useful for showing
   * purchase confirmation on the client side.
   */
  @Get('purchase/:userId')
  checkUserPurchase(@Param('userId') userId: string) {
    return this.appService.checkUserPurchase(userId);
  }

  /**
   * GET /flash-sale/metrics
   *
   * For the operations team - how's the system performing?
   * Success rate, queue size, processing times, etc.
   */
  @Get('metrics')
  getMetrics() {
    return this.appService.getMetrics();
  }

  /**
   * GET /flash-sale/health
   *
   * Is the system healthy? Load balancers use this to know
   * if they should send traffic to this instance.
   */
  @Get('health')
  getHealthCheck() {
    return this.appService.getHealthCheck();
  }
}
