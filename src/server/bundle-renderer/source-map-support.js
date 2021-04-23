/* @flow */

const SourceMapConsumer = require('source-map').SourceMapConsumer

const filenameRE = /\(([^)]+\.js):(\d+):(\d+)\)$/

/**
 * 返回模块文件路径到 能表示一个经过解析的source map文件的实例（SourceMapConsumer的实例） 的映射
 * @param {Object} rawMaps bundle JSON对象的maps属性的值
 * @returns
 */
export function createSourceMapConsumers (rawMaps: Object) {
  const maps = {}
  Object.keys(rawMaps).forEach(file => { // file为模块文件的路径
    maps[file] = new SourceMapConsumer(rawMaps[file]) // 创建能表示一个经过解析的source map文件的实例
  })
  return maps
}

/**
 * 转换Error内出错的位置为原始文件的位置
 * @param {any} e Error
 * @param {Object} mapConsumers 文件名到SourceMap对象的映射
 */
export function rewriteErrorTrace (e: any, mapConsumers: {
  [key: string]: SourceMapConsumer
}) {
  if (e && typeof e.stack === 'string') { // stack用来描述代码中 Error 被实例化的位置
    e.stack = e.stack.split('\n').map(line => { // 按行拆分
      return rewriteTraceLine(line, mapConsumers)
    }).join('\n')
  }
}

function rewriteTraceLine (trace: string, mapConsumers: {
  [key: string]: SourceMapConsumer
}) {
  const m = trace.match(filenameRE) // 匹配js文件
  const map = m && mapConsumers[m[1]] // 从mapConsumers中匹配文件
  if (m != null && map) {
    const originalPosition = map.originalPositionFor({ // 匹配出错文件的位置在source map中记录的原始位置
      line: Number(m[2]),
      column: Number(m[3])
    })
    if (originalPosition.source != null) {
      const { source, line, column } = originalPosition
      const mappedPosition = `(${source.replace(/^webpack:\/\/\//, '')}:${String(line)}:${String(column)})`
      return trace.replace(filenameRE, mappedPosition)
    } else {
      return trace
    }
  } else {
    return trace
  }
}
