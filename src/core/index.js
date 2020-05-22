import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

// 初始化Vue的全局属性，即“Vue.xxx”Vue对象本身的属性
initGlobalAPI(Vue)

// 定义Vue实例的原型的$isServer只读属性
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering // 是否在服务端
})

// 定义Vue实例的原型的$ssrContext属性
// $ssrContext属性的作用是什么？？？
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
