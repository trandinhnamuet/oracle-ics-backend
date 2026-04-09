/**
 * Centralised auth i18n translation map.
 * Supports: vi (default), en, ja, ko, zh.
 * Usage:  t('login.invalidCredentials', lang)
 *         t('login.requiresVerification', lang, { email: 'foo@bar.com' })
 */

export type Lang = 'vi' | 'en' | 'ja' | 'ko' | 'zh';
export const SUPPORTED_LANGS: Lang[] = ['vi', 'en', 'ja', 'ko', 'zh'];
export const DEFAULT_LANG: Lang = 'vi';

type DeepMessages = { [key: string]: string | DeepMessages };

const messages: Record<Lang, DeepMessages> = {
  /* ─────────────────────────────── VIETNAMESE ────────────────────────────── */
  vi: {
    common: {
      refreshTokenNotFound: 'Không tìm thấy refresh token.',
      logoutSuccess: 'Đăng xuất thành công.',
      logoutAllSuccess: 'Đã đăng xuất khỏi tất cả thiết bị.',
    },
    register: {
      emailAlreadyExists:
        'Email này đã được đăng ký. Vui lòng sử dụng email khác hoặc đăng nhập.',
      success:
        'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.',
    },
    verifyOtp: {
      userNotFound: 'Không tìm thấy tài khoản với email này.',
      alreadyVerified: 'Email đã được xác thực. Bạn có thể đăng nhập ngay.',
      invalidOtp: 'Mã OTP không đúng. Vui lòng kiểm tra lại.',
      otpExpired: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.',
      success: 'Email đã được xác thực thành công. Bạn có thể đăng nhập.',
    },
    resendOtp: {
      userNotFound: 'Không tìm thấy tài khoản với email này.',
      alreadyVerified: 'Email đã được xác thực. Bạn có thể đăng nhập ngay.',
      success: 'OTP đã được gửi lại đến email của bạn.',
    },
    login: {
      invalidCredentials:
        'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại thông tin đăng nhập.',
      noPassword:
        'Tài khoản này chưa có mật khẩu. Vui lòng sử dụng tính năng "Quên mật khẩu" để đặt mật khẩu hoặc đăng nhập bằng Google.',
      requiresVerification:
        'Tài khoản này chưa xác thực. OTP đã được gửi về email {{email}}. Vui lòng nhập OTP để xác thực tài khoản.',
    },
    validateUser: {
      userNotFound: 'Không tìm thấy tài khoản.',
    },
    refresh: {
      jwtExpired: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
      invalidSession: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
      sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    },
    forgotPassword: {
      notFound: 'Tài khoản chưa được đăng ký. Vui lòng kiểm tra lại email.',
      success: 'OTP đặt lại mật khẩu đã được gửi đến email của bạn.',
    },
    verifyResetOtp: {
      userNotFound: 'Không tìm thấy tài khoản với email này.',
      invalidOtp: 'Mã OTP không đúng. Vui lòng kiểm tra lại.',
      otpExpired: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.',
      success: 'OTP đã được xác thực thành công. Bạn có thể đặt lại mật khẩu.',
    },
    resetPassword: {
      userNotFound: 'Không tìm thấy tài khoản với email này.',
      invalidOtp: 'Mã OTP không đúng. Vui lòng kiểm tra lại.',
      otpExpired: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.',
      success:
        'Mật khẩu đã được đặt lại thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    },
    googleAuth: {
      differentProvider:
        'Email này đã được đăng ký bằng phương thức khác. Vui lòng sử dụng phương thức đăng nhập ban đầu.',
    },
    notifications: {
      loginTitle: '🔐 Đăng nhập thành công',
      loginBody:
        'Tài khoản của bạn vừa được đăng nhập{{ipSuffix}}. Nếu không phải bạn, hãy đổi mật khẩu ngay.',
      loginIpSuffix: ' từ IP {{ip}}',
      passwordResetTitle: '🔑 Mật khẩu đã được đặt lại',
      passwordResetBody:
        'Mật khẩu của bạn vừa được đặt lại thành công qua OTP. Nếu không phải bạn thực hiện, hãy liên hệ hỗ trợ ngay lập tức.',
      googleLoginTitle: '🔐 Đăng nhập Google thành công',
      googleLoginBody:
        'Tài khoản của bạn vừa được đăng nhập qua Google{{ipSuffix}}. Nếu không phải bạn, hãy liên hệ hỗ trợ ngay.',
    },
  },

  /* ─────────────────────────────── ENGLISH ───────────────────────────────── */
  en: {
    common: {
      refreshTokenNotFound: 'Refresh token not found.',
      logoutSuccess: 'Logged out successfully.',
      logoutAllSuccess: 'Logged out from all devices successfully.',
    },
    register: {
      emailAlreadyExists:
        'This email is already registered. Please use a different email or login.',
      success:
        'Registration successful. Please check your email for OTP verification.',
    },
    verifyOtp: {
      userNotFound: 'No account found with this email.',
      alreadyVerified: 'Email is already verified. You can login now.',
      invalidOtp: 'Invalid OTP code. Please check and try again.',
      otpExpired: 'OTP code has expired. Please request a new code.',
      success: 'Email verified successfully. You can now login.',
    },
    resendOtp: {
      userNotFound: 'No account found with this email.',
      alreadyVerified: 'Email is already verified. You can login now.',
      success: 'OTP has been resent to your email.',
    },
    login: {
      invalidCredentials:
        'Incorrect email or password. Please check your login information.',
      noPassword:
        'This account has no password set. Please use "Forgot Password" to set a password or login with Google.',
      requiresVerification:
        'This account is not verified. An OTP has been sent to {{email}}. Please enter the OTP to verify your account.',
    },
    validateUser: {
      userNotFound: 'Account not found.',
    },
    refresh: {
      jwtExpired: 'Session expired. Please login again.',
      invalidSession: 'Invalid session. Please login again.',
      sessionExpired: 'Session has expired. Please login again.',
    },
    forgotPassword: {
      notFound: 'This email is not registered. Please check and try again.',
      success: 'Password reset OTP has been sent to your email.',
    },
    verifyResetOtp: {
      userNotFound: 'No account found with this email.',
      invalidOtp: 'Invalid OTP code. Please check and try again.',
      otpExpired: 'OTP code has expired. Please request a new code.',
      success: 'OTP verified successfully. You can now reset your password.',
    },
    resetPassword: {
      userNotFound: 'No account found with this email.',
      invalidOtp: 'Invalid OTP code. Please check and try again.',
      otpExpired: 'OTP code has expired. Please request a new code.',
      success:
        'Password has been reset successfully. You can now login with your new password.',
    },
    googleAuth: {
      differentProvider:
        'This email is registered with a different login method. Please use your original login method.',
    },
    notifications: {
      loginTitle: '🔐 Login successful',
      loginBody:
        "Your account was just logged in{{ipSuffix}}. If this wasn't you, change your password immediately.",
      loginIpSuffix: ' from IP {{ip}}',
      passwordResetTitle: '🔑 Password has been reset',
      passwordResetBody:
        'Your password was successfully reset via OTP. If you did not initiate this, contact support immediately.',
      googleLoginTitle: '🔐 Google login successful',
      googleLoginBody:
        "Your account was logged in via Google{{ipSuffix}}. If this wasn't you, contact support immediately.",
    },
  },

  /* ─────────────────────────────── JAPANESE ──────────────────────────────── */
  ja: {
    common: {
      refreshTokenNotFound: 'リフレッシュトークンが見つかりません。',
      logoutSuccess: 'ログアウトしました。',
      logoutAllSuccess: 'すべてのデバイスからログアウトしました。',
    },
    register: {
      emailAlreadyExists:
        'このメールアドレスはすでに登録されています。別のメールアドレスを使用するかログインしてください。',
      success:
        '登録が完了しました。OTP認証のためメールをご確認ください。',
    },
    verifyOtp: {
      userNotFound: 'このメールアドレスのアカウントが見つかりません。',
      alreadyVerified: 'メールアドレスは確認済みです。今すぐログインできます。',
      invalidOtp: '無効なOTPコードです。再度確認してください。',
      otpExpired: 'OTPコードの有効期限が切れました。新しいコードをリクエストしてください。',
      success: 'メールアドレスの確認が完了しました。ログインできます。',
    },
    resendOtp: {
      userNotFound: 'このメールアドレスのアカウントが見つかりません。',
      alreadyVerified: 'メールアドレスは確認済みです。今すぐログインできます。',
      success: 'OTPをメールアドレスに再送信しました。',
    },
    login: {
      invalidCredentials:
        'メールアドレスまたはパスワードが正しくありません。ログイン情報を確認してください。',
      noPassword:
        'このアカウントにはパスワードが設定されていません。「パスワードをお忘れですか」機能を使用するか、Googleでログインしてください。',
      requiresVerification:
        'このアカウントは未確認です。{{email}} にOTPが送信されました。OTPを入力してアカウントを確認してください。',
    },
    validateUser: {
      userNotFound: 'アカウントが見つかりません。',
    },
    refresh: {
      jwtExpired: 'セッションの有効期限が切れました。再度ログインしてください。',
      invalidSession: '無効なセッションです。再度ログインしてください。',
      sessionExpired: 'セッションの有効期限が切れました。再度ログインしてください。',
    },
    forgotPassword: {
      notFound: 'このメールアドレスは登録されていません。ご確認の上、再度お試しください。',
      success: 'パスワードリセット用のOTPをメールアドレスに送信しました。',
    },
    verifyResetOtp: {
      userNotFound: 'このメールアドレスのアカウントが見つかりません。',
      invalidOtp: '無効なOTPコードです。再度確認してください。',
      otpExpired: 'OTPコードの有効期限が切れました。新しいコードをリクエストしてください。',
      success: 'OTPの確認が完了しました。パスワードをリセットできます。',
    },
    resetPassword: {
      userNotFound: 'このメールアドレスのアカウントが見つかりません。',
      invalidOtp: '無効なOTPコードです。再度確認してください。',
      otpExpired: 'OTPコードの有効期限が切れました。新しいコードをリクエストしてください。',
      success: 'パスワードが正常にリセットされました。新しいパスワードでログインできます。',
    },
    googleAuth: {
      differentProvider:
        'このメールアドレスは他のログイン方法で登録されています。元のログイン方法をご使用ください。',
    },
    notifications: {
      loginTitle: '🔐 ログイン成功',
      loginBody:
        'お客様のアカウントにログインが行われました{{ipSuffix}}。心当たりがない場合は、直ちにパスワードを変更してください。',
      loginIpSuffix: '（IP: {{ip}}より）',
      passwordResetTitle: '🔑 パスワードがリセットされました',
      passwordResetBody:
        'パスワードがOTPを通じて正常にリセットされました。心当たりがない場合は、すぐにサポートにご連絡ください。',
      googleLoginTitle: '🔐 Googleログイン成功',
      googleLoginBody:
        'お客様のアカウントがGoogleを通じてログインされました{{ipSuffix}}。心当たりがない場合は、サポートにご連絡ください。',
    },
  },

  /* ──────────────────────────────── KOREAN ───────────────────────────────── */
  ko: {
    common: {
      refreshTokenNotFound: '리프레시 토큰을 찾을 수 없습니다.',
      logoutSuccess: '로그아웃 되었습니다.',
      logoutAllSuccess: '모든 기기에서 로그아웃 되었습니다.',
    },
    register: {
      emailAlreadyExists:
        '이 이메일은 이미 등록되어 있습니다. 다른 이메일을 사용하거나 로그인해 주세요.',
      success:
        '등록이 완료되었습니다. OTP 인증을 위해 이메일을 확인해 주세요.',
    },
    verifyOtp: {
      userNotFound: '이 이메일로 등록된 계정을 찾을 수 없습니다.',
      alreadyVerified: '이메일은 이미 인증되었습니다. 지금 로그인할 수 있습니다.',
      invalidOtp: '잘못된 OTP 코드입니다. 다시 확인해 주세요.',
      otpExpired: 'OTP 코드가 만료되었습니다. 새 코드를 요청해 주세요.',
      success: '이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.',
    },
    resendOtp: {
      userNotFound: '이 이메일로 등록된 계정을 찾을 수 없습니다.',
      alreadyVerified: '이메일은 이미 인증되었습니다. 지금 로그인할 수 있습니다.',
      success: 'OTP가 이메일로 재전송되었습니다.',
    },
    login: {
      invalidCredentials:
        '이메일 또는 비밀번호가 올바르지 않습니다. 로그인 정보를 확인해 주세요.',
      noPassword:
        '이 계정에는 비밀번호가 설정되어 있지 않습니다. "비밀번호 찾기" 기능을 사용하거나 Google로 로그인해 주세요.',
      requiresVerification:
        '이 계정은 인증되지 않았습니다. {{email}}로 OTP가 전송되었습니다. OTP를 입력하여 계정을 인증해 주세요.',
    },
    validateUser: {
      userNotFound: '계정을 찾을 수 없습니다.',
    },
    refresh: {
      jwtExpired: '세션이 만료되었습니다. 다시 로그인해 주세요.',
      invalidSession: '유효하지 않은 세션입니다. 다시 로그인해 주세요.',
      sessionExpired: '세션이 만료되었습니다. 다시 로그인해 주세요.',
    },
    forgotPassword: {
      notFound: '등록되지 않은 이메일입니다. 다시 확인해 주세요.',
      success: '비밀번호 재설정 OTP가 이메일로 전송되었습니다.',
    },
    verifyResetOtp: {
      userNotFound: '이 이메일로 등록된 계정을 찾을 수 없습니다.',
      invalidOtp: '잘못된 OTP 코드입니다. 다시 확인해 주세요.',
      otpExpired: 'OTP 코드가 만료되었습니다. 새 코드를 요청해 주세요.',
      success: 'OTP 인증이 완료되었습니다. 이제 비밀번호를 재설정할 수 있습니다.',
    },
    resetPassword: {
      userNotFound: '이 이메일로 등록된 계정을 찾을 수 없습니다.',
      invalidOtp: '잘못된 OTP 코드입니다. 다시 확인해 주세요.',
      otpExpired: 'OTP 코드가 만료되었습니다. 새 코드를 요청해 주세요.',
      success: '비밀번호가 성공적으로 재설정되었습니다. 새 비밀번호로 로그인할 수 있습니다.',
    },
    googleAuth: {
      differentProvider:
        '이 이메일은 다른 로그인 방법으로 등록되어 있습니다. 원래 로그인 방법을 사용해 주세요.',
    },
    notifications: {
      loginTitle: '🔐 로그인 성공',
      loginBody:
        '귀하의 계정에 로그인이 이루어졌습니다{{ipSuffix}}. 본인이 아닌 경우 즉시 비밀번호를 변경해 주세요.',
      loginIpSuffix: ' (IP: {{ip}})',
      passwordResetTitle: '🔑 비밀번호가 재설정되었습니다',
      passwordResetBody:
        '비밀번호가 OTP를 통해 성공적으로 재설정되었습니다. 본인이 아닌 경우 즉시 지원팀에 문의해 주세요.',
      googleLoginTitle: '🔐 Google 로그인 성공',
      googleLoginBody:
        'Google을 통해 귀하의 계정에 로그인이 이루어졌습니다{{ipSuffix}}. 본인이 아닌 경우 지원팀에 문의해 주세요.',
    },
  },

  /* ───────────────────────────── CHINESE ─────────────────────────────────── */
  zh: {
    common: {
      refreshTokenNotFound: '未找到刷新令牌。',
      logoutSuccess: '已成功退出登录。',
      logoutAllSuccess: '已成功从所有设备退出登录。',
    },
    register: {
      emailAlreadyExists:
        '该邮箱已被注册。请使用其他邮箱或直接登录。',
      success:
        '注册成功。请查收邮件中的OTP验证码。',
    },
    verifyOtp: {
      userNotFound: '未找到与该邮箱关联的账户。',
      alreadyVerified: '邮箱已验证。您可以立即登录。',
      invalidOtp: 'OTP验证码无效。请重新检查。',
      otpExpired: 'OTP验证码已过期。请重新申请新验证码。',
      success: '邮箱验证成功。您现在可以登录。',
    },
    resendOtp: {
      userNotFound: '未找到与该邮箱关联的账户。',
      alreadyVerified: '邮箱已验证。您可以立即登录。',
      success: 'OTP已重新发送至您的邮箱。',
    },
    login: {
      invalidCredentials:
        '邮箱或密码不正确，请检查您的登录信息。',
      noPassword:
        '该账户尚未设置密码。请使用"忘记密码"功能设置密码，或使用Google登录。',
      requiresVerification:
        '该账户未验证。OTP已发送至 {{email}}。请输入OTP以完成账户验证。',
    },
    validateUser: {
      userNotFound: '未找到该账户。',
    },
    refresh: {
      jwtExpired: '会话已过期。请重新登录。',
      invalidSession: '无效的会话。请重新登录。',
      sessionExpired: '会话已过期。请重新登录。',
    },
    forgotPassword: {
      notFound: '该邮箱尚未注册，请检查后重试。',
      success: '密码重置OTP已发送至您的邮箱。',
    },
    verifyResetOtp: {
      userNotFound: '未找到与该邮箱关联的账户。',
      invalidOtp: 'OTP验证码无效。请重新检查。',
      otpExpired: 'OTP验证码已过期。请重新申请新验证码。',
      success: 'OTP验证成功。您可以重置密码了。',
    },
    resetPassword: {
      userNotFound: '未找到与该邮箱关联的账户。',
      invalidOtp: 'OTP验证码无效。请重新检查。',
      otpExpired: 'OTP验证码已过期。请重新申请新验证码。',
      success: '密码重置成功。您现在可以使用新密码登录。',
    },
    googleAuth: {
      differentProvider:
        '该邮箱已通过其他方式注册。请使用原始登录方式。',
    },
    notifications: {
      loginTitle: '🔐 登录成功',
      loginBody:
        '您的账户刚刚登录{{ipSuffix}}。如果不是您本人操作，请立即更改密码。',
      loginIpSuffix: '（来自IP {{ip}}）',
      passwordResetTitle: '🔑 密码已重置',
      passwordResetBody:
        '您的密码已通过OTP成功重置。如果不是您本人操作，请立即联系支持。',
      googleLoginTitle: '🔐 Google登录成功',
      googleLoginBody:
        '您的账户刚刚通过Google登录{{ipSuffix}}。如果不是您本人操作，请立即联系支持。',
    },
  },
};

/** Resolve the best supported language from an Accept-Language header value. */
export function extractLang(acceptLanguage?: string): Lang {
  if (!acceptLanguage) return DEFAULT_LANG;
  const primary = acceptLanguage
    .split(',')[0]
    .trim()
    .split(';')[0]
    .split('-')[0]
    .toLowerCase();
  return (SUPPORTED_LANGS.includes(primary as Lang) ? primary : DEFAULT_LANG) as Lang;
}

/** Look up a dotted key in the message map, interpolate {{var}} tokens, fall back to vi. */
export function t(
  key: string,
  lang: string = DEFAULT_LANG,
  args?: Record<string, string>,
): string {
  const resolvedLang = (
    SUPPORTED_LANGS.includes(lang as Lang) ? lang : DEFAULT_LANG
  ) as Lang;

  const lookup = (root: DeepMessages, keys: string[]): string | undefined => {
    let cur: DeepMessages | string = root;
    for (const k of keys) {
      if (typeof cur !== 'object') return undefined;
      cur = cur[k];
    }
    return typeof cur === 'string' ? cur : undefined;
  };

  const keys = key.split('.');
  let result =
    lookup(messages[resolvedLang], keys) ??
    lookup(messages[DEFAULT_LANG], keys) ??
    key;

  if (args) {
    for (const [k, v] of Object.entries(args)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }
  }

  return result;
}
