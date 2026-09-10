import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { SiteVisitEntity } from '../../entities/site-visit.entity'
import { TrackVisitDto } from '../../entities/dto/track-visit.dto'

/* ------------------------------------------------------------------ */
/* Bóc user-agent                                                      */
/* ------------------------------------------------------------------ */

/**
 * Chỉ cần họ trình duyệt / HĐH / loại thiết bị, không cần số hiệu bản dựng —
 * nên viết tay chừng này thay vì kéo thêm ua-parser-js vào dependency.
 *
 * Thứ tự các nhánh có ý nghĩa: Edge và Opera đều tự nhận là Chrome, Chrome lại
 * tự nhận là Safari, nên phải xét thằng cụ thể trước.
 *
 * Giá trị trả về là **khoá ổn định**, không phải nhãn hiển thị: phía admin tự
 * dịch sang ngôn ngữ đang chọn.
 */
export function parseUserAgent(ua: string): {
  device: string
  browser: string
  os: string
} {
  const s = ua || ''

  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)
    ? 'tablet'
    : /Mobi|Android|iPhone|iPod|Windows Phone/i.test(s)
      ? 'mobile'
      : 'desktop'

  let browser = 'other'
  if (/Edg[A-Z]?\//i.test(s)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera'
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/CriOS/i.test(s)) browser = 'Chrome'
  else if (/FxiOS/i.test(s)) browser = 'Firefox'
  else if (/Firefox\//i.test(s)) browser = 'Firefox'
  else if (/Chrome\//i.test(s)) browser = 'Chrome'
  else if (/Safari\//i.test(s)) browser = 'Safari'

  let os = 'other'
  if (/Windows NT/i.test(s)) os = 'Windows'
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS'
  else if (/Android/i.test(s)) os = 'Android'
  else if (/Mac OS X/i.test(s)) os = 'macOS'
  else if (/CrOS/i.test(s)) os = 'ChromeOS'
  else if (/Linux/i.test(s)) os = 'Linux'

  return { device, browser, os }
}

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|embedly|quora|pinterest|vkshare|preview|scanner|curl|wget|python-requests|axios|headless|lighthouse|pagespeed|gtmetrix|semrush|ahrefs|mj12|dotbot|petalbot|applebot|duckduckbot|yandex|uptime|monitor/i

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua)
}

/* ------------------------------------------------------------------ */
/* Khoảng thời gian                                                    */
/* ------------------------------------------------------------------ */

/**
 * Việt Nam là UTC+7 cố định, không có giờ mùa hè — nên mốc ngày tính được
 * bằng số học offset, không cần tra bảng timezone.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const VN_TZ = 'Asia/Ho_Chi_Minh'

export const VISIT_RANGE_DAYS: Record<string, number | null> = {
  today: 0,
  '7d': 7,
  '28d': 28,
  '90d': 90,
  all: null,
}

export type VisitRange = keyof typeof VISIT_RANGE_DAYS

export function isVisitRange(value?: string | null): value is VisitRange {
  return !!value && value in VISIT_RANGE_DAYS
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Nửa đêm giờ Việt Nam của một ngày lịch, trả về mốc tuyệt đối (UTC). */
function vnDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+07:00`)
}

/** Ngày lịch hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
function vnToday(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Cửa sổ [start, end) cho mọi truy vấn.
 *
 * Cắt theo **ngày lịch giờ Việt Nam** chứ không phải cửa sổ trượt N×24h kể từ
 * bây giờ: "7 ngày" nghĩa là 6 ngày trước cộng hôm nay, khớp cách người dùng
 * đọc biểu đồ theo ngày bên dưới. Dùng NOW() thì cột đầu và cột cuối của biểu
 * đồ luôn bị cụt một phần ngày.
 */
export function resolveWindow(
  range: VisitRange,
  from?: string,
  to?: string,
): { start: Date; end: Date } {
  const todayStart = vnDayStart(vnToday())
  const tomorrow = new Date(todayStart.getTime() + DAY_MS)

  // Khoảng do người dùng tự chọn thắng preset; hai đầu đều tính trọn ngày.
  if (from && DATE_RE.test(from)) {
    const start = vnDayStart(from)
    const end =
      to && DATE_RE.test(to)
        ? new Date(vnDayStart(to).getTime() + DAY_MS)
        : tomorrow
    if (end > start) return { start, end }
  }

  const days = VISIT_RANGE_DAYS[range]
  if (days === null) return { start: new Date(0), end: tomorrow }
  if (days === 0) return { start: todayStart, end: tomorrow }
  return { start: new Date(todayStart.getTime() - (days - 1) * DAY_MS), end: tomorrow }
}

/* ------------------------------------------------------------------ */

export interface VisitStats {
  range: VisitRange
  from: string
  to: string
  summary: {
    visits: number
    visitors: number
    ips: number
    sessions: number
    newVisitors: number
    returningVisits: number
    botVisits: number
  }
  daily: { date: string; visits: number; visitors: number }[]
  topPaths: { name: string; value: number }[]
  topReferrers: { name: string; value: number }[]
  devices: { name: string; value: number }[]
  browsers: { name: string; value: number }[]
  operatingSystems: { name: string; value: number }[]
  topVisitors: {
    visitorId: string
    visits: number
    ipCount: number
    lastIp: string | null
    firstSeen: string
    lastSeen: string
    lastPath: string | null
    device: string | null
  }[]
  recent: {
    id: string
    createdAt: string
    ip: string | null
    visitorId: string
    sessionId: string
    isNewVisitor: boolean
    path: string
    title: string | null
    referrer: string | null
    device: string | null
    browser: string | null
    os: string | null
    screen: string | null
    lang: string | null
  }[]
  recentTotal: number
  page: number
  pageSize: number
  updatedAt: string
}

export const VISIT_PAGE_SIZE = 50

const TABLE = 'oracle.site_visits'

const num = (v: unknown) => Number(v ?? 0)
const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : v == null ? '' : String(v)

@Injectable()
export class VisitLogService {
  private readonly logger = new Logger(VisitLogService.name)

  constructor(
    @InjectRepository(SiteVisitEntity)
    private readonly repo: Repository<SiteVisitEntity>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Ghi nhận                                                          */
  /* ---------------------------------------------------------------- */

  async recordVisit(dto: TrackVisitDto, ip: string | null, userAgent: string) {
    const { device, browser, os } = parseUserAgent(userAgent)
    const cut = (v: string | null | undefined, max: number) =>
      v ? v.slice(0, max) : null

    await this.repo.insert({
      visitor_id: dto.visitor_id.slice(0, 64),
      session_id: dto.session_id.slice(0, 64),
      is_new_visitor: dto.is_new_visitor === true,
      ip: cut(ip, 45),
      path: dto.path.slice(0, 512),
      title: cut(dto.title, 255),
      referrer: cut(dto.referrer, 512),
      device,
      browser,
      os,
      screen: cut(dto.screen, 16),
      lang: cut(dto.lang, 16),
      user_agent: cut(userAgent, 512),
      is_bot: isBot(userAgent),
    })
  }

  /* ---------------------------------------------------------------- */
  /* Truy vấn cho màn hình thống kê                                    */
  /* ---------------------------------------------------------------- */

  async getStats(
    range: VisitRange,
    page: number,
    search: string,
    from?: string,
    to?: string,
  ): Promise<VisitStats> {
    const { start, end } = resolveWindow(range, from, to)

    // $1/$2 là hai đầu cửa sổ, dùng chung cho mọi truy vấn bên dưới.
    const W = 'created_at >= $1 AND created_at < $2'
    const HUMAN = `${W} AND is_bot = false`
    const p: unknown[] = [start, end]

    // Ô tìm kiếm chỉ lọc bảng "từng lượt truy cập"; các biểu đồ tổng quan vẫn
    // giữ nguyên toàn kỳ để người xem còn thấy được bối cảnh.
    const term = search.trim()
    const searchSql = term
      ? ' AND (ip ILIKE $3 OR visitor_id ILIKE $3 OR path ILIKE $3 OR COALESCE(referrer, \'\') ILIKE $3)'
      : ''
    const searchParams = term ? [`%${term}%`] : []

    const pageSize = VISIT_PAGE_SIZE
    const safePage = Math.max(1, page)
    const offset = (safePage - 1) * pageSize

    const q = (sql: string, params: unknown[] = p) =>
      this.repo.query(sql, params) as Promise<Record<string, unknown>[]>

    const [
      summaryRows,
      botRows,
      dailyRows,
      pathRows,
      referrerRows,
      deviceRows,
      browserRows,
      osRows,
      visitorRows,
      recentRows,
      recentCountRows,
    ] = await Promise.all([
      q(`SELECT COUNT(*)::int AS visits,
                COUNT(DISTINCT visitor_id)::int AS visitors,
                COUNT(DISTINCT ip)::int AS ips,
                COUNT(DISTINCT session_id)::int AS sessions,
                (COUNT(*) FILTER (WHERE is_new_visitor))::int AS new_visitors
           FROM ${TABLE} WHERE ${HUMAN}`),
      q(`SELECT COUNT(*)::int AS bots FROM ${TABLE} WHERE ${W} AND is_bot = true`),
      q(`SELECT to_char(created_at AT TIME ZONE '${VN_TZ}', 'YYYY-MM-DD') AS date,
                COUNT(*)::int AS visits,
                COUNT(DISTINCT visitor_id)::int AS visitors
           FROM ${TABLE} WHERE ${HUMAN}
          GROUP BY 1 ORDER BY 1`),
      q(`SELECT path AS name, COUNT(*)::int AS value
           FROM ${TABLE} WHERE ${HUMAN}
          GROUP BY 1 ORDER BY value DESC, name LIMIT 10`),
      q(`SELECT COALESCE(referrer, '') AS name, COUNT(*)::int AS value
           FROM ${TABLE} WHERE ${HUMAN}
          GROUP BY 1 ORDER BY value DESC, name LIMIT 10`),
      q(`SELECT COALESCE(device, 'other') AS name, COUNT(*)::int AS value
           FROM ${TABLE} WHERE ${HUMAN}
          GROUP BY 1 ORDER BY value DESC`),
      q(`SELECT COALESCE(browser, 'other') AS name, COUNT(*)::int AS value
           FROM ${TABLE} WHERE ${HUMAN}
          GROUP BY 1 ORDER BY value DESC LIMIT 8`),
      q(`SELECT COALESCE(os, 'other') AS name, COUNT(*)::int AS value
           FROM ${TABLE} WHERE ${HUMAN}
          GROUP BY 1 ORDER BY value DESC LIMIT 8`),
      q(`SELECT visitor_id,
                COUNT(*)::int AS visits,
                COUNT(DISTINCT ip)::int AS ip_count,
                (array_agg(ip ORDER BY created_at DESC))[1] AS last_ip,
                MIN(created_at) AS first_seen,
                MAX(created_at) AS last_seen,
                (array_agg(path ORDER BY created_at DESC))[1] AS last_path,
                (array_agg(device ORDER BY created_at DESC))[1] AS device
           FROM ${TABLE} WHERE ${HUMAN}
          GROUP BY visitor_id ORDER BY visits DESC, last_seen DESC LIMIT 20`),
      q(
        `SELECT id, created_at, ip, visitor_id, session_id, is_new_visitor, path,
                title, referrer, device, browser, os, screen, lang
           FROM ${TABLE} WHERE ${HUMAN}${searchSql}
          ORDER BY created_at DESC, id DESC
          LIMIT ${pageSize} OFFSET ${offset}`,
        [...p, ...searchParams],
      ),
      q(`SELECT COUNT(*)::int AS total FROM ${TABLE} WHERE ${HUMAN}${searchSql}`, [
        ...p,
        ...searchParams,
      ]),
    ])

    const s = summaryRows[0] ?? {}
    const visits = num(s.visits)
    const newVisitors = num(s.new_visitors)

    return {
      range,
      // Trả lại đúng cửa sổ đã dùng để admin hiển thị được "từ ngày … đến ngày …"
      // kể cả khi preset và from/to đá nhau.
      from: new Date(start.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10),
      to: new Date(end.getTime() + VN_OFFSET_MS - DAY_MS).toISOString().slice(0, 10),
      summary: {
        visits,
        visitors: num(s.visitors),
        ips: num(s.ips),
        sessions: num(s.sessions),
        newVisitors,
        returningVisits: Math.max(0, visits - newVisitors),
        botVisits: num(botRows[0]?.bots),
      },
      daily: dailyRows.map((r) => ({
        date: String(r.date),
        visits: num(r.visits),
        visitors: num(r.visitors),
      })),
      topPaths: pathRows.map((r) => ({ name: String(r.name), value: num(r.value) })),
      topReferrers: referrerRows.map((r) => ({
        name: String(r.name ?? ''),
        value: num(r.value),
      })),
      devices: deviceRows.map((r) => ({ name: String(r.name), value: num(r.value) })),
      browsers: browserRows.map((r) => ({ name: String(r.name), value: num(r.value) })),
      operatingSystems: osRows.map((r) => ({
        name: String(r.name),
        value: num(r.value),
      })),
      topVisitors: visitorRows.map((r) => ({
        visitorId: String(r.visitor_id),
        visits: num(r.visits),
        ipCount: num(r.ip_count),
        lastIp: (r.last_ip as string) ?? null,
        firstSeen: iso(r.first_seen),
        lastSeen: iso(r.last_seen),
        lastPath: (r.last_path as string) ?? null,
        device: (r.device as string) ?? null,
      })),
      recent: recentRows.map((r) => ({
        id: String(r.id),
        createdAt: iso(r.created_at),
        ip: (r.ip as string) ?? null,
        visitorId: String(r.visitor_id),
        sessionId: String(r.session_id),
        isNewVisitor: r.is_new_visitor === true,
        path: String(r.path),
        title: (r.title as string) ?? null,
        referrer: (r.referrer as string) ?? null,
        device: (r.device as string) ?? null,
        browser: (r.browser as string) ?? null,
        os: (r.os as string) ?? null,
        screen: (r.screen as string) ?? null,
        lang: (r.lang as string) ?? null,
      })),
      recentTotal: num(recentCountRows[0]?.total),
      page: safePage,
      pageSize,
      updatedAt: new Date().toISOString(),
    }
  }

  /** Dọn bản ghi cũ — gọi từ scheduler nếu sau này bảng phình to. */
  async cleanupOldRecords(daysOld = 365) {
    const cutoff = new Date(Date.now() - daysOld * DAY_MS)
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute()
    return { deleted_count: result.affected || 0, cutoff_date: cutoff }
  }
}
