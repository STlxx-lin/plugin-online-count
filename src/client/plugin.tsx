import { Plugin } from '@nocobase/client';
import models from './models';

export class PluginOnlineCountClient extends Plugin {
  async load() {
    this.flowEngine.registerModels(models);
  }
}

export default PluginOnlineCountClient;
