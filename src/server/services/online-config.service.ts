import { Application } from '@nocobase/server';
import { CONFIG_KEYS, DEFAULT_CONFIGS } from '../constants';

export class OnlineConfigService {
  private app: Application;
  private cache = new Map<string, any>();
  private initialized = false;

  constructor(app: Application) {
    this.app = app;
  }

  async loadConfigs(): Promise<void> {
    try {
      const repo = this.app.db.getRepository('online_configs');
      if (!repo) return;

      const configs = await repo.find();
      this.cache.clear();

      // 先加载默认值
      for (const [k, v] of Object.entries(DEFAULT_CONFIGS)) {
        this.cache.set(k, v);
      }

      // 覆盖数据库中存储的配置
      for (const item of configs) {
        let val = item.value;
        try {
          val = JSON.parse(item.value);
        } catch {
          val = item.value;
        }
        this.cache.set(item.key, val);
      }
      this.initialized = true;
    } catch {
      // 数据库表未就绪时使用默认值
      for (const [k, v] of Object.entries(DEFAULT_CONFIGS)) {
        this.cache.set(k, v);
      }
    }
  }

  get<T = any>(key: string, defaultValue?: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    return defaultValue !== undefined ? defaultValue : (DEFAULT_CONFIGS[key] as unknown as T);
  }

  getNumber(key: string, defaultValue?: number): number {
    const val = this.get(key, defaultValue);
    const num = Number(val);
    return isNaN(num) ? (defaultValue ?? 0) : num;
  }

  getBoolean(key: string, defaultValue?: boolean): boolean {
    const val: any = this.get(key, defaultValue);
    return val === true || val === 'true' || val === 1 || val === '1';
  }

  getString(key: string, defaultValue?: string): string {
    const val = this.get(key, defaultValue);
    return val !== undefined && val !== null ? String(val) : (defaultValue ?? '');
  }

  async set(key: string, value: any, description = ''): Promise<void> {
    const repo = this.app.db.getRepository('online_configs');
    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

    this.cache.set(key, value);

    if (repo) {
      const existing = await repo.findOne({ filter: { key } });
      if (existing) {
        await repo.update({
          filterByTk: existing.id,
          values: { value: strVal, description: description || existing.description },
        });
      } else {
        await repo.create({
          values: { key, value: strVal, description },
        });
      }
    }
  }

  async getAllConfigs(): Promise<Record<string, any>> {
    if (!this.initialized) {
      await this.loadConfigs();
    }
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(DEFAULT_CONFIGS)) {
      result[k] = this.get(k, v);
    }
    return result;
  }
}
