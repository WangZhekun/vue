'use strict';

/*  */

var isJS = function (file) { return /\.js(\?[^.]+)?$/.test(file); };

var ref = require('chalk');
var red = ref.red;
var yellow = ref.yellow;

var prefix = "[vue-server-renderer-webpack-plugin]";
var warn = exports.warn = function (msg) { return console.error(red((prefix + " " + msg + "\n"))); };
var tip = exports.tip = function (msg) { return console.log(yellow((prefix + " " + msg + "\n"))); };

var validate = function (compiler) {
  if (compiler.options.target !== 'node') { // webpack配置：target必须是node
    warn('webpack config `target` should be "node".');
  }

  if (compiler.options.output && compiler.options.output.libraryTarget !== 'commonjs2') { // webpack配置：output.libraryTarget必须是commonjs2
    warn('webpack config `output.libraryTarget` should be "commonjs2".');
  }

  if (!compiler.options.externals) { // 建议配置外部依赖
    tip(
      'It is recommended to externalize dependencies in the server build for ' +
      'better build performance.'
    );
  }
};

var onEmit = function (compiler, name, hook) {
  if (compiler.hooks) {
    // Webpack >= 4.0.0
    compiler.hooks.emit.tapAsync(name, hook);
  } else {
    // Webpack < 4.0.0
    compiler.plugin('emit', hook);
  }
};

/**
 * SSR Server插件
 * @param {Object} options 插件的配置项
 */
var VueSSRServerPlugin = function VueSSRServerPlugin (options) {
  if ( options === void 0 ) options = {};

  this.options = Object.assign({
    filename: 'vue-ssr-server-bundle.json' // 输出的文件名
  }, options);
};

VueSSRServerPlugin.prototype.apply = function apply (compiler) {
    var this$1 = this;

  validate(compiler); // 验证webpack的配置

  // 注册webpack的emit钩子，该钩子在输出 asset（资源） 到 output 目录之前执行
  // 该回调的功能是将webpack 编译好的资源提取到JSON对象，并将原资源列表替换成只包含SSR Server需要输出的JSON文件的资源列表，继续走
  onEmit(compiler, 'vue-server-plugin', function (compilation, cb) {
    var stats = compilation.getStats().toJson(); // 返回当前编译的状态对象
    var entryName = Object.keys(stats.entrypoints)[0]; // 入口文件名
    var entryInfo = stats.entrypoints[entryName]; // 入口文件的 bundles

    if (!entryInfo) {
      // #5553
      return cb()
    }

    var entryAssets = entryInfo.assets.filter(isJS); // 过滤js文件

    if (entryAssets.length > 1) {
      throw new Error(
        "Server-side bundle should have one single entry file. " +
        "Avoid using CommonsChunkPlugin in the server config."
      )
    }

    var entry = entryAssets[0]; // 只能有一个入口
    if (!entry || typeof entry !== 'string') {
      throw new Error(
        ("Entry \"" + entryName + "\" not found. Did you specify the correct entry option?")
      )
    }

    var bundle = {
      entry: entry,
      files: {},
      maps: {}
    };

    stats.assets.forEach(function (asset) { // 遍历资源
      if (isJS(asset.name)) { // 是js资源
        bundle.files[asset.name] = compilation.assets[asset.name].source(); // 资源名称到资源内容的映射
      } else if (asset.name.match(/\.js\.map$/)) { // 是map文件
        bundle.maps[asset.name.replace(/\.map$/, '')] = JSON.parse(compilation.assets[asset.name].source()); // 资源名称到map文件内容（转成json对象）的映射
      }
      // do not emit anything else for server
      delete compilation.assets[asset.name]; // 删除资源
    });

    var json = JSON.stringify(bundle, null, 2); // bundle转换成字符串，2个空格的缩进
    var filename = this$1.options.filename; // 输出文件的名称

    compilation.assets[filename] = { // 添加删除文件到资源列表
      source: function () { return json; },
      size: function () { return json.length; }
    };

    cb();
  });
};

module.exports = VueSSRServerPlugin;
