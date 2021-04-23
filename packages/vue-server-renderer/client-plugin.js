'use strict';

/*  */

var isJS = function (file) { return /\.js(\?[^.]+)?$/.test(file); };

var isCSS = function (file) { return /\.css(\?[^.]+)?$/.test(file); };

var ref = require('chalk');
var red = ref.red;
var yellow = ref.yellow;

var prefix = "[vue-server-renderer-webpack-plugin]";
var warn = exports.warn = function (msg) { return console.error(red((prefix + " " + msg + "\n"))); };
var tip = exports.tip = function (msg) { return console.log(yellow((prefix + " " + msg + "\n"))); };

var onEmit = function (compiler, name, hook) {
  if (compiler.hooks) {
    // Webpack >= 4.0.0
    compiler.hooks.emit.tapAsync(name, hook);
  } else {
    // Webpack < 4.0.0
    compiler.plugin('emit', hook);
  }
};

var hash = require('hash-sum');
var uniq = require('lodash.uniq');

var VueSSRClientPlugin = function VueSSRClientPlugin (options) {
  if ( options === void 0 ) options = {};

  this.options = Object.assign({
    filename: 'vue-ssr-client-manifest.json' // 输出文件的文件名
  }, options);
};

VueSSRClientPlugin.prototype.apply = function apply (compiler) {
  var this$1 = this;

  // 注册webpack的emit钩子，该钩子在输出 asset（资源） 到 output 目录之前执行
  onEmit(compiler, 'vue-client-plugin', function (compilation, cb) {
    var stats = compilation.getStats().toJson(); // 返回当前编译的状态对象

    var allFiles = uniq(stats.assets
      .map(function (a) { return a.name; })); // 获取资源名称

    var initialFiles = uniq(Object.keys(stats.entrypoints) // 入口文件
      .map(function (name) { return stats.entrypoints[name].assets; }) // 获取每个入口资源
      .reduce(function (assets, all) { return all.concat(assets); }, []) // 压缩成一维数组
      .filter(function (file) { return isJS(file) || isCSS(file); })); // 过滤掉非js和非css文件

    var asyncFiles = allFiles
      .filter(function (file) { return isJS(file) || isCSS(file); }) // 过滤所有文件（资源）中非js和非css文件
      .filter(function (file) { return initialFiles.indexOf(file) < 0; }); // 过滤掉入口的文件

    var manifest = {
      publicPath: stats.publicPath, // webpack的output.publicPath
      all: allFiles, // 所有资源
      initial: initialFiles, // 入口js或css资源
      async: asyncFiles, // 非入口js或css资源
      modules: { /* [identifier: string]: Array<index: number> */ }
    };

    var assetModules = stats.modules.filter(function (m) { return m.assets.length; }); // 过滤掉没有资源的模块
    var fileToIndex = function (file) { return manifest.all.indexOf(file); };
    stats.modules.forEach(function (m) {
      // ignore modules duplicated in multiple chunks
      if (m.chunks.length === 1) {
        var cid = m.chunks[0]; // 取chunk的id
        var chunk = stats.chunks.find(function (c) { return c.id === cid; }); // 从chunk列表中取指定id的chunk
        if (!chunk || !chunk.files) {
          return
        }
        var id = m.identifier.replace(/\s\w+$/, ''); // remove appended hash
        var files = manifest.modules[hash(id)] = chunk.files.map(fileToIndex); // 模块id做哈希，添加到模块的资源文件在所有资源中的索引
        // find all asset modules associated with the same chunk
        assetModules.forEach(function (m) { // TODO modules、chunks、assets、stats需要再了解了解含义
          if (m.chunks.some(function (id) { return id === cid; })) {
            files.push.apply(files, m.assets.map(fileToIndex));
          }
        });
      }
    });

    var json = JSON.stringify(manifest, null, 2); // bundle转换成字符串，2个空格的缩进
    compilation.assets[this$1.options.filename] = { // 将json文件加入到资源列表中
      source: function () { return json; },
      size: function () { return json.length; }
    };
    cb();
  });
};

module.exports = VueSSRClientPlugin;
