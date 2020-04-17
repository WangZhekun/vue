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

initMixin(Vue)
stateMixin(Vue)
eventsMixin(Vue)
lifecycleMixin(Vue)
renderMixin(Vue)

export default Vue
