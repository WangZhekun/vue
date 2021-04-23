/* @flow */

/**
 * Creates a mapper that maps components used during a server-side render
 * to async chunk files in the client-side build, so that we can inline them
 * directly in the rendered HTML to avoid waterfall requests.
 */

import type { ClientManifest } from './index'

export type AsyncFileMapper = (files: Array<string>) => Array<string>;

export function createMapper (
  clientManifest: ClientManifest
): AsyncFileMapper {
  const map = createMap(clientManifest) // 获取clientManifest.modules的keys中的id，与之对应的异步文件或非js、css文件名列表的映射表
  // map server-side moduleIds to client-side files
  /**
   * 获取moduleIds中的id对应的文件路径（客户端渲染的文件）的集合
   */
  return function mapper (moduleIds: Array<string>): Array<string> {
    const res = new Set()
    for (let i = 0; i < moduleIds.length; i++) {
      const mapped = map.get(moduleIds[i])
      if (mapped) {
        for (let j = 0; j < mapped.length; j++) {
          res.add(mapped[j])
        }
      }
    }
    return Array.from(res)
  }
}

/**
 * 获取clientManifest.modules的keys中的id，与之对应的异步文件或非js、css文件名列表的映射表
 * @param {Object} clientManifest
 * @returns Map<string, Array<string>>
 */
function createMap (clientManifest) {
  const map = new Map()
  Object.keys(clientManifest.modules).forEach(id => {
    map.set(id, mapIdToFile(id, clientManifest))
  })
  return map
}

/**
 * 获取id对应的异步文件或非js、css文件名列表
 * @param {string} id clientManifest.modules的keys中的项
 * @param {Object} clientManifest 由 vue-server-renderer/client-plugin 生成的客户端构建 manifest 对象(client build manifest object)。包含了 webpack 整个构建过程的信息，从而可以让 bundle renderer 自动推导需要在 HTML 模板中注入的内容
 * @returns id对应的异步文件或非js、css文件名列表
 */
function mapIdToFile (id, clientManifest) {
  const files = []
  const fileIndices = clientManifest.modules[id]
  if (fileIndices) {
    fileIndices.forEach(index => { // index为该文件在clientManifest.all中的索引
      const file = clientManifest.all[index] // 获取文件名
      // only include async files or non-js, non-css assets
      if (clientManifest.async.indexOf(file) > -1 || !(/\.(js|css)($|\?)/.test(file))) { // 该文件为异步文件，即在clientManifest.async中，或文件不是js、css文件
        files.push(file)
      }
    })
  }
  return files
}
