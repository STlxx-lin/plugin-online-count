import { Cache } from '@nocobase/cache';
import { Database } from '@nocobase/database';
/** 用户级黑名单缓存 key 前缀，供 auth-middleware 和 plugin.ts 共用 */
export declare const USER_BLACKLIST_PREFIX = "online-count-user-blacklist:";
/** JWT 黑名单拦截中间件：Cache 级拦截被踢 token + DB 级黑名单检查（带 30s 缓存），放行认证接口 */
interface BlacklistContext {
    state: {
        currentRole?: string;
    };
    auth?: {
        user?: {
            id?: string | number;
        };
    };
    path: string;
    get: (key: string) => string;
    throw: (code: number, message: string) => void;
}
export declare function createTokenBlacklistMiddleware(tokenBlacklist: Cache, db: Database, logger?: {
    error: (...args: unknown[]) => void;
}): (ctx: BlacklistContext, next: () => Promise<void>) => Promise<void>;
export default createTokenBlacklistMiddleware;
