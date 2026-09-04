export interface DeviceInfo {
  browser: string;
  os: string;
  device: 'Desktop' | 'Mobile' | 'Tablet';
}

export function parseUserAgent(ua = ''): DeviceInfo {
  if (!ua) {
    return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };
  }

  const uaLower = ua.toLowerCase();

  // 1. 设备类型判断
  let device: 'Desktop' | 'Mobile' | 'Tablet' = 'Desktop';
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle|silk|opera mini/i.test(ua)) {
    device = 'Mobile';
  }

  // 2. 操作系统判断
  let os = 'Unknown OS';
  if (/windows nt 10\.0/i.test(ua)) os = 'Windows 10/11';
  else if (/windows nt 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/windows nt 6\.2/i.test(ua)) os = 'Windows 8';
  else if (/windows nt 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) {
    const match = ua.match(/mac os x (\d+[._]\d+[._]?\d*)/i);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    const match = ua.match(/os (\d+[._]\d+[._]?\d*)/i);
    os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/android/i.test(ua)) {
    const match = ua.match(/android\s+([\d.]+)/i);
    os = match ? `Android ${match[1]}` : 'Android';
  } else if (/linux/i.test(ua)) os = 'Linux';

  // 3. 浏览器判断
  let browser = 'Unknown Browser';
  if (/micromessenger/i.test(ua)) browser = 'WeChat';
  else if (/dingtalk/i.test(ua)) browser = 'DingTalk';
  else if (/edg\//i.test(ua)) {
    const m = ua.match(/edg\/([\d.]+)/i);
    browser = m ? `Edge ${m[1].split('.')[0]}` : 'Edge';
  } else if (/chrome\/|crios\//i.test(ua) && !/opr\/|opera/i.test(ua)) {
    const m = ua.match(/(?:chrome|crios)\/([\d.]+)/i);
    browser = m ? `Chrome ${m[1].split('.')[0]}` : 'Chrome';
  } else if (/firefox\/|fxios\//i.test(ua)) {
    const m = ua.match(/(?:firefox|fxios)\/([\d.]+)/i);
    browser = m ? `Firefox ${m[1].split('.')[0]}` : 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
    const m = ua.match(/version\/([\d.]+)/i);
    browser = m ? `Safari ${m[1].split('.')[0]}` : 'Safari';
  } else if (/opr\/|opera/i.test(ua)) {
    browser = 'Opera';
  }

  return { browser, os, device };
}

export function extractClientIp(ctx: any): string {
  if (!ctx) return '127.0.0.1';
  const headers = ctx.headers || ctx.req?.headers || {};
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const ipStr = Array.isArray(forwarded) ? forwarded[0] : String(forwarded);
    return ipStr.split(',')[0].trim();
  }
  return headers['x-real-ip'] || ctx.ip || ctx.socket?.remoteAddress || '127.0.0.1';
}
