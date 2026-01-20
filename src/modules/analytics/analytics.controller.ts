import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common'
import { AnalyticsService } from './analytics.service'
import { CreatePageAnalyticsDto } from '../../entities/dto/create-page-analytics.dto'
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'

@Controller('api/analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  /**
   * Record a page view (public endpoint - no auth required)
   */
  @Post()
  async recordPageView(@Body() createAnalyticsDto: CreatePageAnalyticsDto) {
    try {
      const result = await this.analyticsService.recordPageView(
        createAnalyticsDto,
      )
      return {
        success: true,
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record analytics',
      }
    }
  }

  /**
   * Get dashboard statistics (requires authentication)
   */
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboardStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      // Default to last 30 days
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30))

      if (start > end) {
        throw new BadRequestException('Start date must be before end date')
      }

      const stats = await this.analyticsService.getDashboardStats(start, end)
      return {
        success: true,
        data: stats,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch statistics',
      }
    }
  }

  /**
   * Get page views by path (requires authentication)
   */
  @Get('pages')
  @UseGuards(JwtAuthGuard)
  async getPageViewsByPath(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30))

      const pages = await this.analyticsService.getPageViewsByPath(start, end)
      return {
        success: true,
        data: pages,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch page data',
      }
    }
  }

  /**
   * Get daily page views (requires authentication)
   */
  @Get('daily')
  @UseGuards(JwtAuthGuard)
  async getPageViewsByDate(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30))

      const daily = await this.analyticsService.getPageViewsByDate(start, end)
      return {
        success: true,
        data: daily,
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch daily statistics',
      }
    }
  }

  /**
   * Get average page load time (requires authentication)
   */
  @Get('load-time')
  @UseGuards(JwtAuthGuard)
  async getAveragePageLoadTime(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30))

      const loadTime = await this.analyticsService.getAveragePageLoadTime(start, end)
      return {
        success: true,
        data: loadTime,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch load time data',
      }
    }
  }

  /**
   * Get unique users count (requires authentication)
   */
  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getUniqueUsers(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30))

      const users = await this.analyticsService.getUniqueUsers(start, end)
      return {
        success: true,
        data: users,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch user data',
      }
    }
  }

  /**
   * Get bounce rate (requires authentication)
   */
  @Get('bounce-rate')
  @UseGuards(JwtAuthGuard)
  async getBounceRate(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30))

      const bounceRate = await this.analyticsService.getBounceRate(start, end)
      return {
        success: true,
        data: bounceRate,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch bounce rate',
      }
    }
  }

  /**
   * Get top events (requires authentication)
   */
  @Get('events')
  @UseGuards(JwtAuthGuard)
  async getTopEvents(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit: string = '10',
  ) {
    try {
      const end = endDate ? new Date(endDate) : new Date()
      const start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30))

      const events = await this.analyticsService.getTopEvents(start, end, parseInt(limit))
      return {
        success: true,
        data: events,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch events data',
      }
    }
  }
}
