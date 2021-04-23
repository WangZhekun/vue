/* @flow */

process.env.VUE_ENV = 'server'

import { extend } from 'shared/util'
import modules from './server/modules/index'
import baseDirectives from './server/directives/index'
import { isUnaryTag, canBeLeftOpenTag } from './compiler/util'

import { createRenderer as _createRenderer } from 'server/create-renderer'
import { createBundleRendererCreator } from 'server/bundle-renderer/create-bundle-renderer'

/**
 * 创建renderer对象，该对象由两个渲染方法组成
 * @param {RenderOptions} options 配置项
 * @returns renderer对象，该对象由两个渲染方法组成，一个是将Vue实例和模板渲染成完成HTMl文件内容，一个是将Vue实例，或加上模板，渲染结束，返回流对象
 */
export function createRenderer (options?: Object = {}): {
  renderToString: Function,
  renderToStream: Function
} {
  return _createRenderer(extend(extend({}, options), { // 创建renderer对象，该对象由两个渲染方法组成，一个是将Vue实例和模板渲染成完成HTMl文件内容，一个是将Vue实例，或加上模板，渲染结束，返回流对象
    isUnaryTag,
    canBeLeftOpenTag,
    modules,
    // user can provide server-side implementations for custom directives
    // when creating the renderer.
    directives: extend(baseDirectives, options.directives)
  }))
}

export const createBundleRenderer = createBundleRendererCreator(createRenderer) // 创建能创建BundleRenderer对象的工厂函数
