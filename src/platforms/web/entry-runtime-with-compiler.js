/* @flow */

/**
 * 该文件是几种编译模式的入口，包括浏览器的运行时+编译器开发/生产模式的模块
 */

import config from 'core/config'
import { warn, cached } from 'core/util/index' // warn来自src/core/util/debug.js，实际是src/shared/util.js中的noop函数，noop是空函数 cached来自src/shared/util.js
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

/**
 * idToTemplate 是一个带缓存的(id) => { return el.innerHTML }函数
 * 功能：返回指定id选择器的DOM节点的内部HTML
 */
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount // 缓存原挂载方法
/**
 * 定义新挂载方法
 * 新挂载方法中处理了无render函数的情况，将模板转化为render函数，再调用原挂载方法
 * @param {string | Element} el DOM节点的选择器，或节点对象，Vue实例的挂载点
 * @param {boolean} hydrating 是否将DOM节点与vnode关联
 */
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el) // 如果el为字符串，则获取该选择器对应的DOM节点

  /* istanbul ignore if */
  if (el === document.body || el === document.documentElement) { // Vue实例挂载点不能是<body>和<html>
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 解析模板，将其转化为render函数
  if (!options.render) {
    let template = options.template
    if (template) {
      if (typeof template === 'string') { // template是字符串
        if (template.charAt(0) === '#') {
          template = idToTemplate(template) // 查询DOM中指定id的节点的innerHTML，即返回Vue实例锚点内的模板
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) { // template是DOM节点
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) { // 模板不存在，但el存在
      template = getOuterHTML(el) // 获取el的HTML串
    }
    if (template) { // 模板存在
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production', // 非生产环境标志
        shouldDecodeNewlines, // 在浏览器中，需要解码
        shouldDecodeNewlinesForHref, // 在浏览器中，href属性值需要解码
        delimiters: options.delimiters, // 改变纯文本插入分隔符
        comments: options.comments // 是否保留模板中的注释
      }, this) // 编译模板，生成ast树，生成render和静态render函数
      options.render = render // render函数
      options.staticRenderFns = staticRenderFns // 静态render函数

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  return mount.call(this, el, hydrating) // 调用原始挂载方法
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
/**
 * 返回el的HTML串
 * @param {Element} el DOM节点
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions // 转换函数 —— 编译模板并将字符串状态的render和静态render函数转化为Function

export default Vue
