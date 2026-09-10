import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

/**
 * Nhật ký truy cập tự thu thập cho oraclecloud.vn — thay cho Google Analytics.
 *
 * Khác với `page_analytics` (bảng cũ, gắn với GA4 và chỉ lưu event chung chung),
 * bảng này lưu **từng lượt mở trang** kèm bốn thứ GA4 không trả về:
 *   1. IP thô của từng lượt
 *   2. Định danh khách do mình kiểm soát (visitor_id trong localStorage)
 *   3. Xem được từng lượt lẻ chứ không chỉ số đã gộp
 *   4. Không bị ad-blocker chặn vì beacon bắn về chính domain của mình
 */
@Entity({ name: 'site_visits', schema: 'oracle' })
@Index(['created_at'])
@Index(['visitor_id', 'created_at'])
@Index(['session_id'])
@Index(['path', 'created_at'])
@Index(['ip', 'created_at'])
export class SiteVisitEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** UUID sinh phía client, giữ trong localStorage → nhận ra khách quay lại */
  @Column({ type: 'varchar', length: 64 })
  visitor_id: string

  /** UUID giữ trong sessionStorage → gom các trang trong cùng một phiên */
  @Column({ type: 'varchar', length: 64 })
  session_id: string

  /** Lượt này là lần đầu tiên visitor_id xuất hiện trên trình duyệt đó */
  @Column({ type: 'boolean', default: false })
  is_new_visitor: boolean

  /** Lấy từ request.ip (trust proxy = loopback), không tin header của client */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null

  @Column({ type: 'varchar', length: 512 })
  path: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null

  @Column({ type: 'varchar', length: 512, nullable: true })
  referrer: string | null

  /** desktop | mobile | tablet — suy từ user-agent */
  @Column({ type: 'varchar', length: 16, nullable: true })
  device: string | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  browser: string | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  os: string | null

  /** Độ phân giải màn hình, ví dụ 1920x1080 */
  @Column({ type: 'varchar', length: 16, nullable: true })
  screen: string | null

  @Column({ type: 'varchar', length: 16, nullable: true })
  lang: string | null

  @Column({ type: 'varchar', length: 512, nullable: true })
  user_agent: string | null

  /**
   * Vẫn ghi lượt của bot nhưng đánh dấu lại, mặc định loại khỏi mọi số liệu.
   * Xoá thẳng thì nhẹ bảng hơn nhưng mất luôn khả năng kiểm chứng khi số liệu
   * đột ngột nhảy — giữ cờ rẻ hơn nhiều so với việc đoán mò về sau.
   */
  @Column({ type: 'boolean', default: false })
  is_bot: boolean

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date
}
