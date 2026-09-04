const path = require('path');
const fs = require('fs');

if (!process.env.NODE_MODULES_PATH) {
  process.env.NODE_MODULES_PATH = path.resolve(process.cwd(), 'node_modules');
}

const bundledNodeModules = path.resolve(__dirname, 'dist/node_modules');
if (fs.existsSync(bundledNodeModules)) {
  if (!module.paths.includes(bundledNodeModules)) {
    module.paths.unshift(bundledNodeModules);
  }
}

try {
  const { PluginManager } = require('@nocobase/server');
  if (PluginManager) {
    const parsedNames = PluginManager.parsedNames || (PluginManager.parsedNames = {});
    parsedNames['online-count'] = {
      name: 'online-count',
      packageName: '@nocobase/plugin-online-count',
    };
    parsedNames['@nocobase/plugin-online-count'] = {
      name: 'online-count',
      packageName: '@nocobase/plugin-online-count',
    };
  }
} catch (e) {}

let plugin;
if (fs.existsSync(path.resolve(__dirname, 'dist/index.js'))) {
  plugin = require(path.resolve(__dirname, 'dist/index.js'));
} else if (fs.existsSync(path.resolve(__dirname, 'dist/server/index.js'))) {
  plugin = require(path.resolve(__dirname, 'dist/server/index.js'));
} else {
  plugin = require('./src/server');
}

module.exports = plugin.default || plugin;
