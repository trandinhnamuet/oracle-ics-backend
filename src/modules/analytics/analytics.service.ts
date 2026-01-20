import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between, MoreThan, LessThan } from 'typeorm'
import { PageAnalyticsEntity } from '../../entities/page-analytics.entity'
import { CreatePageAnalyticsDto } from '../../entities/dto/create-page-analytics.dto'

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(PageAnalyticsEntity)
    private analyticsRepository: Repository<PageAnalyticsEntity>,
  ) {}

  /**
   * Record a page analytics event
   */
  async recordPageView(createAnalyticsDto: CreatePageAnalyticsDto) {
    const analytics = this.analyticsRepository.create(createAnalyticsDto)
    return this.analyticsRepository.save(analytics)
  }

  /**
   * Get total page views for a date range
   */
  async getTotalPageViews(startDate: Date, endDate: Date) {
    return this.analyticsRepository.count({
      where: {
        event_type: 'page_view',
        created_at: Between(startDate, endDate),
      },
    })
  }

  /**
   * Get page views by page path
   */
  async getPageViewsByPath(startDate: Date, endDate: Date) {
    const results = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('analytics.page_path', 'page_path')
      .addSelect('analytics.page_title', 'page_title')
      .addSelect('COUNT(*)', 'view_count')
      .where('analytics.event_type = :event_type', { event_type: 'page_view' })
      .andWhere('analytics.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('analytics.page_path')
      .addGroupBy('analytics.page_title')
      .orderBy('view_count', 'DESC')
      .limit(20)
      .getRawMany()

    return results.map((r) => ({
      page_path: r.page_path,
      page_title: r.page_title,
      view_count: parseInt(r.view_count),
    }))
  }

  /**
   * Get page views by date (daily stats)
   */
  async getPageViewsByDate(startDate: Date, endDate: Date) {
    const results = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select("DATE(analytics.created_at AT TIME ZONE 'UTC')", 'date')
      .addSelect('COUNT(*)', 'view_count')
      .where('analytics.event_type = :event_type', { event_type: 'page_view' })
      .andWhere('analytics.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy("DATE(analytics.created_at AT TIME ZONE 'UTC')")
      .orderBy("DATE(analytics.created_at AT TIME ZONE 'UTC')", 'ASC')
      .getRawMany()

    return results.map((r) => ({
      date: r.date,
      view_count: parseInt(r.view_count),
    }))
  }

  /**
   * Get average page load time
   */
  async getAveragePageLoadTime(startDate: Date, endDate: Date) {
    const result = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('AVG(analytics.load_time_ms)', 'avg_load_time')
      .addSelect('MAX(analytics.load_time_ms)', 'max_load_time')
      .addSelect('MIN(analytics.load_time_ms)', 'min_load_time')
      .where('analytics.event_type = :event_type', {
        event_type: 'page_load_time',
      })
      .andWhere('analytics.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne()

    return {
      avg_load_time: result?.avg_load_time ? parseInt(result.avg_load_time) : 0,
      max_load_time: result?.max_load_time ? parseInt(result.max_load_time) : 0,
      min_load_time: result?.min_load_time ? parseInt(result.min_load_time) : 0,
    }
  }

  /**
   * Get unique users count (based on user_agent)
   */
  async getUniqueUsers(startDate: Date, endDate: Date) {
    const result = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('COUNT(DISTINCT analytics.user_agent)', 'unique_users')
      .where('analytics.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne()

    return {
      unique_users: parseInt(result?.unique_users || '0'),
    }
  }

  /**
   * Get bounce rate (sessions with only 1 page view)
   */
  async getBounceRate(startDate: Date, endDate: Date) {
    const totalSessions = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('COUNT(DISTINCT analytics.session_id)', 'total_sessions')
      .where('analytics.event_type = :event_type', { event_type: 'page_view' })
      .andWhere('analytics.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne()

    const bouncedSessions = await this.analyticsRepository
      .query(
        `
        SELECT COUNT(*) as count FROM (
          SELECT session_id, COUNT(*) as page_count
          FROM page_analytics
          WHERE event_type = 'page_view'
          AND created_at BETWEEN $1 AND $2
          AND session_id IS NOT NULL
          GROUP BY session_id
          HAVING COUNT(*) = 1
        ) as bounced
      `,
        [startDate, endDate],
      )

    const total = parseInt(totalSessions?.total_sessions || '0')
    const bounced = parseInt(bouncedSessions?.[0]?.count || '0')

    return {
      bounce_rate: total > 0 ? parseFloat(((bounced / total) * 100).toFixed(2)) : 0,
      bounced_sessions: bounced,
      total_sessions: total,
    }
  }

  /**
   * Get top events
   */
  async getTopEvents(startDate: Date, endDate: Date, limit: number = 10) {
    const results = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('analytics.event_type', 'event_type')
      .addSelect('COUNT(*)', 'event_count')
      .where('analytics.event_type != :page_view', { page_view: 'page_view' })
      .andWhere('analytics.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('analytics.event_type')
      .orderBy('event_count', 'DESC')
      .limit(limit)
      .getRawMany()

    return results.map((r) => ({
      event_type: r.event_type,
      event_count: parseInt(r.event_count),
    }))
  }

  /**
   * Get all analytics for dashboard
   */
  async getDashboardStats(startDate: Date, endDate: Date) {
    const [
      totalPageViews,
      pageViewsByPath,
      pageViewsByDate,
      avgPageLoadTime,
      uniqueUsers,
      bounceRate,
      topEvents,
    ] = await Promise.all([
      this.getTotalPageViews(startDate, endDate),
      this.getPageViewsByPath(startDate, endDate),
      this.getPageViewsByDate(startDate, endDate),
      this.getAveragePageLoadTime(startDate, endDate),
      this.getUniqueUsers(startDate, endDate),
      this.getBounceRate(startDate, endDate),
      this.getTopEvents(startDate, endDate),
    ])

    return {
      summary: {
        total_page_views: totalPageViews,
        unique_users: uniqueUsers.unique_users,
        bounce_rate: bounceRate.bounce_rate,
        avg_load_time: avgPageLoadTime.avg_load_time,
      },
      pages: pageViewsByPath,
      daily_views: pageViewsByDate,
      events: topEvents,
      date_range: {
        start: startDate,
        end: endDate,
      },
    }
  }

  /**
   * Delete old analytics records (older than 90 days)
   */
  async cleanupOldRecords(daysOld: number = 90) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    const result = await this.analyticsRepository.delete({
      created_at: LessThan(cutoffDate),
    })

    return {
      deleted_count: result.affected || 0,
      cutoff_date: cutoffDate,
    }
  }
}
