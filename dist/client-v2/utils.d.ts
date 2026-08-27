export declare function formatDuration(seconds: number): string;
/** 格式化时间戳为本地时间字符串 */
export declare function formatTime(ts: number): string;
/** 状态文本标签 */
export declare function statusLabel(status: string, t: (key: string) => string): string;
/** 状态颜色 */
export declare function statusColor(status: string): string;
export declare function unwrapPayload<T = unknown>(res: unknown): T;
