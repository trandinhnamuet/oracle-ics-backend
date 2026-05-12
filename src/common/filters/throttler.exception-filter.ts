import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response, Request } from 'express';

type Lang = 'vi' | 'en' | 'ja' | 'ko' | 'zh' | 'th';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ThrottlerExceptionFilter.name);

  private readonly messages: Record<Lang, Record<string, string>> = {
    vi: {
      login: 'Bạn đã vượt quá giới hạn số lần đăng nhập (tối đa 10 lần/15 phút). Vui lòng chờ một chút rồi thử lại.',
      adminLogin: 'Bạn đã vượt quá giới hạn số lần đăng nhập admin (tối đa 20 lần/1 phút). Vui lòng chờ 1 phút rồi thử lại.',
      otp: 'Bạn đã vượt quá giới hạn yêu cầu (tối đa 3 lần/1 phút). Vui lòng chờ 1 phút rồi thử lại.',
      default: 'Bạn đã vượt quá giới hạn yêu cầu. Vui lòng chờ một chút rồi thử lại.',
    },
    en: {
      login: 'You have exceeded the login limit (maximum 10 times per 15 minutes). Please wait a moment and try again.',
      adminLogin: 'You have exceeded the admin login limit (maximum 20 times per 1 minute). Please wait 1 minute and try again.',
      otp: 'You have exceeded the request limit (maximum 3 times per 1 minute). Please wait 1 minute and try again.',
      default: 'You have exceeded the request limit. Please wait a moment and try again.',
    },
    ja: {
      login: 'ログイン回数の上限に達しました（15分間に最大10回）。しばらく待ってからもう一度お試しください。',
      adminLogin: '管理者ログインの上限に達しました（1分間に最大20回）。1分待ってからもう一度お試しください。',
      otp: 'リクエスト数の上限に達しました（1分間に最大3回）。1分待ってからもう一度お試しください。',
      default: 'リクエスト数の上限に達しました。しばらく待ってからもう一度お試しください。',
    },
    ko: {
      login: '로그인 횟수 제한을 초과했습니다(15분마다 최대 10회). 잠시 기다린 후 다시 시도해주세요.',
      adminLogin: '관리자 로그인 횟수 제한을 초과했습니다(1분마다 최대 20회). 1분 기다린 후 다시 시도해주세요.',
      otp: '요청 횟수 제한을 초과했습니다(1분마다 최대 3회). 1분 기다린 후 다시 시도해주세요.',
      default: '요청 횟수 제한을 초과했습니다. 잠시 기다린 후 다시 시도해주세요.',
    },
    zh: {
      login: '您超过了登录限制（每15分钟最多10次）。请稍候再试。',
      adminLogin: '您超过了管理员登录限制（每1分钟最多20次）。请等待1分钟后重试。',
      otp: '您超过了请求限制（每1分钟最多3次）。请等待1分钟后重试。',
      default: '您超过了请求限制。请稍候再试。',
    },
    th: {
      login: 'คุณเกินขีดจำกัดการเข้าสู่ระบบ (สูงสุด 10 ครั้งต่อ 15 นาที) โปรดรอสักครู่แล้วลองอีกครั้ง',
      adminLogin: 'คุณเกินขีดจำกัดการเข้าสู่ระบบผู้ดูแล (สูงสุด 20 ครั้งต่อ 1 นาที) โปรดรอ 1 นาทีแล้วลองอีกครั้ง',
      otp: 'คุณเกินขีดจำกัดการร้องขอ (สูงสุด 3 ครั้งต่อ 1 นาที) โปรดรอ 1 นาทีแล้วลองอีกครั้ง',
      default: 'คุณเกินขีดจำกัดการร้องขอ โปรดรอสักครู่แล้วลองอีกครั้ง',
    },
  };

  private extractLang(req: Request): Lang {
    const acceptLanguage = req.headers['accept-language'] as string;
    if (!acceptLanguage) return 'vi';
    
    const lang = acceptLanguage.split(',')[0].split('-')[0].toLowerCase() as Lang;
    return this.messages[lang] ? lang : 'vi';
  }

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = HttpStatus.TOO_MANY_REQUESTS;
    const lang = this.extractLang(request);
    const method = request.method;
    const path = request.path;
    const ip = request.ip || request.connection?.remoteAddress;
    
    this.logger.warn(
      `Throttled: ${method} ${path} from ${ip} [${lang}]`
    );

    // Determine user-friendly message based on endpoint
    let messageKey = 'default';
    if (path.includes('/auth/admin-login')) {
      messageKey = 'adminLogin';
    } else if (path.includes('/auth/login')) {
      messageKey = 'login';
    } else if (path.includes('/auth/resend-otp') || path.includes('/auth/forgot-password')) {
      messageKey = 'otp';
    }

    const userMessage = this.messages[lang][messageKey];

    response.status(status).json({
      statusCode: status,
      message: userMessage,
      timestamp: new Date().toISOString(),
      path: path,
    });
  }
}
