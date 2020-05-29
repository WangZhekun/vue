import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

/**
 * File:
 * 定义Vue构造方法
 */

function Vue (options) {
  // process.env.NODE_ENV是Node的环境变量
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    // 在非生产环境时，如果当前function不是以构造函数的方式调用的，则报错
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 调用Vue实例初始化方法
  this._init(options)
}

// 定义各种Vue的原型方法
initMixin(Vue) // 定义_init方法
stateMixin(Vue) // 定义状态相关属性和方法：$data、$props、$set、$delete、$watch
eventsMixin(Vue) // 定义事件相关方法：$on、$once、$off、$emit
lifecycleMixin(Vue) // 定义生命周期相关方法：_update、$forceUpdate、$destroy
renderMixin(Vue) // 定义渲染相关方法：$nextTick、_render

export default Vue
