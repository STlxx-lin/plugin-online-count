export interface KickPlan {
    /** 需要被踢下线的 clientId 列表 */
    toKick: string[];
}
interface KickOnNewConnectionInput {
    /** 触发本次登录的新连接 clientId */
    newClientId: string;
    /** 新连接上报的设备指纹；undefined 表示尚未上报（legacy 客户端 / 消息乱序） */
    newDeviceId?: string;
    /** 该用户当前会话里已有的全部 clientId */
    existingClientIds: string[];
    /** clientId -> deviceId 指纹表 */
    clientDeviceId: Map<string, string>;
}
export declare function computeKickOnNewConnection(input: KickOnNewConnectionInput): KickPlan;
interface EnforceInput {
    existingClientIds: string[];
    clientDeviceId: Map<string, string>;
    clientPingTimes: Map<string, number>;
}
export declare function computeEnforceSingleDevice(input: EnforceInput): KickPlan;
export {};
