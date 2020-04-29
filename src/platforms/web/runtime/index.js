/* @flow */

import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
import platformDirectives from './directives/index' // 平台默认指令
import platformComponents from './components/index' // 平台默认组件

// install platform specific utils
Vue.config.mustUseProp = mustUseProp // 函数：特性（attribute）是否需要被绑定为属性（property）
Vue.config.isReservedTag = isReservedTag // 函数：标签在平台上是否是原生的
Vue.config.isReservedAttr = isReservedAttr // 函数：特性（attribute）是否被保留
Vue.config.getTagNamespace = getTagNamespace // 函数：检查标签的命名空间
Vue.config.isUnknownElement = isUnknownElement // 函数：标签是否为未知节点

// install platform runtime directives & components
extend(Vue.options.directives, platformDirectives) // 合并自定义指令和平台默认指令
extend(Vue.options.components, platformComponents) // 合并自定义组件和平台默认组件

// install platform patch function
Vue.prototype.__patch__ = inBrowser ? patch : noop // 创建、更新、删除VNode的函数

// public mount method
/**
 * 挂载函数
 * @param {string | Element} el 挂载点
 * @param {boolean} hydrating
 */
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined // 如果el为字符串，则获取该选择器对应的DOM节点
  return mountComponent(this, el, hydrating) // 创建模板对应的Watcher实例，完成模板渲染
}

// devtools global hook
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) { // 开着工具可用
      if (devtools) { // 开发者工具
        devtools.emit('init', Vue) // 向开发者工具抛init事件
      } else if (
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test'
      ) {
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
          'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
        `Make sure to turn on production mode when deploying for production.\n` +
        `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

export default Vue
