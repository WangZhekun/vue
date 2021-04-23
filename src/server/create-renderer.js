/* @flow */

import RenderStream from './render-stream'
import { createWriteFunction } from './write'
import { createRenderFunction } from './render'
import { createPromiseCallback } from './util'
import TemplateRenderer from './template-renderer/index'
import type { ClientManifest } from './template-renderer/index'

export type Renderer = {
  renderToString: (component: Component, context: any, cb: any) => ?Promise<string>;
  renderToStream: (component: Component, context?: Object) => stream$Readable;
};

type RenderCache = {
  get: (key: string, cb?: Function) => string | void;
  set: (key: string, val: string) => void;
  has?: (key: string, cb?: Function) => boolean | void;
};

export type RenderOptions = {
  modules?: Array<(vnode: VNode) => ?string>; // vue模块
  directives?: Object; // vue指令
  isUnaryTag?: Function; // 判断传入的节点名称是否为一元节点
  cache?: RenderCache; // 缓存对象，需要包含get和has方法
  template?: string | (content: string, context: any) => string; // 模板
  inject?: boolean; // 是否给模板注入除插值和Vue实例渲染结果之外的内容，如css节点、js节点等
  basedir?: string; // vue-ssr-server-bundle.json文件的读取目录。bundle render使用
  shouldPreload?: Function; // (file: string, type: string) => boolean，判断指定文件是否需要作为`<link rel="preload" ...>`预加载资源（需要解析的）插入到模板中
  shouldPrefetch?: Function; // (file: string, type: string) => boolean，判断指定文件是否需要作为`<link rel="prefetch" ...>`预取资源（缓存资源，不需要解析）插入到模板中
  clientManifest?: ClientManifest; // 由 vue-server-renderer/client-plugin 生成的客户端构建 manifest 对象(client build manifest object)。包含了 webpack 整个构建过程的信息，从而可以让 bundle renderer 自动推导需要在 HTML 模板中注入的内容
  serializer?: Function; // 渲染上下文对象的`state`属性（默认是`state`属性）的值的序列化方法。默认使用serialize-javascript的序列化方法
  runInNewContext?: boolean | 'once'; // 执行bundle模块时是否在新的node上下文中执行。bundle render使用
};

/**
 * 创建renderer对象，该对象由两个渲染方法组成
 * @param {RenderOptions} options 配置对象
 * @returns 由两个渲染方法组成的对象，一个是将Vue实例和模板渲染成完成HTMl文件内容，一个是将Vue实例，或加上模板，渲染结束，返回流对象
 */
export function createRenderer ({
  modules = [], // vue模块
  directives = {}, // vue指令
  isUnaryTag = (() => false), // 判断传入的节点名称是否为一元节点
  template, // 模板
  inject, // 是否给模板注入除插值和Vue实例渲染结果之外的内容，如css节点、js节点等
  cache, // 缓存对象，需要包含get和has方法
  shouldPreload, // (file: string, type: string) => boolean，判断指定文件是否需要作为`<link rel="preload" ...>`预加载资源（需要解析的）插入到模板中
  shouldPrefetch, // (file: string, type: string) => boolean，判断指定文件是否需要作为`<link rel="prefetch" ...>`预取资源（缓存资源，不需要解析）插入到模板中
  clientManifest, // 由 vue-server-renderer/client-plugin 生成的客户端构建 manifest 对象(client build manifest object)。包含了 webpack 整个构建过程的信息，从而可以让 bundle renderer 自动推导需要在 HTML 模板中注入的内容
  // TODO clientManifest.modules的keys中的id的来源待定
  serializer // 渲染上下文对象的`state`属性（默认是`state`属性）的值的序列化方法。默认使用serialize-javascript的序列化方法
}: RenderOptions = {}): Renderer {
  const render = createRenderFunction(modules, directives, isUnaryTag, cache) // 创建render方法
  const templateRenderer = new TemplateRenderer({  // 创建HTML模板渲染对象实例，用于将component渲染出的DOM字符串插入到HTMl模板（template）中，并生成HTML中的其他部分，如<head>、css、js节点等
    template,
    inject,
    shouldPreload,
    shouldPrefetch,
    clientManifest,
    serializer
  })

  return {
    /**
     * 将component渲染成完整的HTMl文件内容
     * @param {Component} component Vue实例
     * @param {Object} context 渲染上下文
     * @param {Function} cb 回调函数第一个参数为error，第二个参数为渲染完成的完整的HTMl文件内容
     * @returns 如果未传入cb，则返回Promise实例
     */
    renderToString ( // 将实例渲染成HTML
      component: Component, // Vue实例
      context: any, // 上下文
      cb: any // 回调函数，第一个参数为error，第二个参数为result
    ): ?Promise<string> {
      if (typeof context === 'function') { // 如果只传了两个参数，第二个参数则为回调函数
        cb = context
        context = {}
      }
      if (context) {
        templateRenderer.bindRenderFns(context) // 将templateRenderer的renderResourceHints、renderState、renderScripts、renderStyles、getPreloadFiles绑定所属对象（templateRenderer）后，植入到context中
      }

      // no callback, return Promise
      let promise
      if (!cb) { // 如果未传入回调函数，则创建Promise实例，在本函数最后返回
        ({ promise, cb } = createPromiseCallback())
      }

      let result = '' // component渲染完成后的DOM节点的字符串
      const write = createWriteFunction(text => { // 创建text => {}函数的包装函数，用于缓存text
        result += text
        return false
      }, cb)
      try {
        // 渲染component，每一部分渲染完成后执行write，最终渲染完成后执行第四个实参（回调函数）
        render(component, write, context, err => {
          if (err) {
            return cb(err)
          }
          if (context && context.rendered) {
            context.rendered(context)
          }
          if (template) {
            try {
              const res = templateRenderer.render(result, context) // 将vue实例的渲染结果插入到模板中，并在模板中插入其他如head的内容、css、js等资源
              if (typeof res !== 'string') {
                // function template returning promise
                res
                  .then(html => cb(null, html)) // html为最终渲染完成的html文件内容
                  .catch(cb)
              } else {
                cb(null, res)
              }
            } catch (e) {
              cb(e)
            }
          } else {
            cb(null, result)
          }
        })
      } catch (e) {
        cb(e)
      }

      return promise
    },

    /**
     * 将component渲染成可读取的流对象，如果存在template则为完整的HTML文件内容的流对象，否则为component渲染结果的流对象
     * @param {Component} component Vue实例
     * @param {Object} context 渲染上下文
     * @returns component渲染结果的渲染流对象，或模板的转换流对象
     */
    renderToStream (
      component: Component,
      context?: Object
    ): stream$Readable {
      if (context) {
        templateRenderer.bindRenderFns(context) // 将templateRenderer的renderResourceHints、renderState、renderScripts、renderStyles、getPreloadFiles绑定所属对象（templateRenderer）后，植入到context中
      }
      // 创建可读取数据的渲染流对象
      const renderStream = new RenderStream((write, done) => {
        render(component, write, context, done) // 渲染component，每一部分渲染完成后执行write，最终渲染完成后执行done
      })
      if (!template) { // 没有模板
        if (context && context.rendered) {
          const rendered = context.rendered // component渲染结束的钩子
          renderStream.once('beforeEnd', () => { // component渲染结束时会触发renderStream的beforeEnd事件
            rendered(context)
          })
        }
        return renderStream // 返回component渲染结果的渲染流对象
      } else if (typeof template === 'function') {
        throw new Error(`function template is only supported in renderToString.`)
      } else { // 有模板，且不是Function
        const templateStream = templateRenderer.createStream(context) // 创建模板的转换流对象
        renderStream.on('error', err => {
          templateStream.emit('error', err)
        })
        renderStream.pipe(templateStream) // 将component的渲染结果，通过管道流入到模板的转换流对象中
        if (context && context.rendered) {
          const rendered = context.rendered // component渲染结束的钩子
          renderStream.once('beforeEnd', () => { // component渲染结束时会触发renderStream的beforeEnd事件
            rendered(context)
          })
        }
        return templateStream // 返回模板的转换流对象
      }
    }
  }
}
