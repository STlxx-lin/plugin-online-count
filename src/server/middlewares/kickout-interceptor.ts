import { Context, Next } from '@nocobase/actions';
import { SessionControlService } from '../services/session-control.service';

export function createKickoutInterceptor(sessionControlService: SessionControlService) {
  return async function kickoutMiddleware(ctx: Context, next: Next) {
    // 提取 Token
    let token = '';
    const authHeader = ctx.headers['authorization'] || ctx.headers['Authorization'];
    if (authHeader && typeof authHeader === 'string') {
      token = authHeader.replace(/^Bearer\s+/i, '').trim();
    }
    if (!token && ctx.cookies) {
      token = ctx.cookies.get('token') || ctx.cookies.get('SESSION') || '';
    }

    if (token) {
      const check = sessionControlService.isTokenKicked(token);
      if (check.kicked) {
        ctx.status = 401;
        ctx.body = {
          code: 'SESSION_KICKED_OUT',
          message: check.reason || '您已被管理员强制下线，请重新登录',
          kicked: true,
        };
        return;
      }
    }

    await next();
  };
}
