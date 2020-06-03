/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

/**
 * 定义创建Vue类的子类API：extend
 * @param {GlobalAPI} Vue Vue构造方法
 */
export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0 // 类ID
  let cid = 1

  /**
   * Class inheritance
   */
  /**
   * 创建Vue类的子类
   * @param {Object} extendOptions 扩展配置对象
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this // Vue类
    const SuperId = Super.cid
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {}) // 构造函数缓存，类ID到构造函数的映射
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    const name = extendOptions.name || Super.options.name // 自己在自己的全局组件中的注册名
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    const Sub = function VueComponent (options) { // 子类构造函数
      this._init(options)
    }
    Sub.prototype = Object.create(Super.prototype) // 定义原型
    Sub.prototype.constructor = Sub // 置构造方法
    Sub.cid = cid++ // 类id
    Sub.options = mergeOptions( // 合并全局配置项
      Super.options,
      extendOptions
    )
    Sub['super'] = Super // 父类

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) {
      initProps(Sub) // 定义Sub.prototype到实例的_props的代理
    }
    if (Sub.options.computed) {
      initComputed(Sub) // 初始化计算属性
    }

    // allow further extension/mixin/plugin usage
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub // 添加自己添加到自己的全局组件中
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options // 父类的配置对象
    Sub.extendOptions = extendOptions // 子类的扩展配置
    Sub.sealedOptions = extend({}, Sub.options) // 子类的全局配置备份

    // cache constructor
    cachedCtors[SuperId] = Sub // 添加构造器缓存
    return Sub
  }
}

/**
 * 定义Comp.prototype到实例的_props的代理
 * @param {VueComponent} Comp 构造函数
 */
function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

/**
 * 初始化计算属性
 * @param {VueComponent} Comp 构造函数
 */
function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key]) // 给target定义计算属性key
  }
}
