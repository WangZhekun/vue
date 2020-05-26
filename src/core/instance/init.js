/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

/**
 * 定义Vue原型的_init API
 * @param {Class<Component>} Vue Vue类
 */
export function initMixin (Vue: Class<Component>) {
  /**
   * Vue实例初始化方法
   * @param {Object} options Vue实例创建的配置项
   */
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this // Component类型在flow/component.js中定义 TODO：为什么Vue的实例是Component类型
    // a uid
    // 实例编号
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    // Vue实例标志，用来避免被响应式数据系统监听
    vm._isVue = true
    // merge options
    if (options && options._isComponent) { // 当前Vue实例是组件实例
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options) // TODO: 先放着
    } else { // 非组件实例
      vm.$options = mergeOptions( // 合并实例初始化配置对象和全局配置对象
        resolveConstructorOptions(vm.constructor), // 根据当前实例的构造方法的父类（如果有）的全局配置，更新并获取全局配置
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm // 代理对象
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm) // 初始化Vue实例的生命周期相关的属性
    initEvents(vm) // 初始化组件的事件监听
    initRender(vm) // 初始化渲染相关的属性
    callHook(vm, 'beforeCreate') // 执行beforeCreate钩子
    initInjections(vm) // 初始化vm注入的内容 resolve injections before data/props
    initState(vm) // 初始化数据、属性、计算属性、watch、方法
    initProvide(vm) // 初始化provide，在响应式数据对象和属性初始化之后初始化，因为可能在provide的属性会依赖响应式数据对象和属性。resolve provide after data/props
    callHook(vm, 'created') // 执行created钩子

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) { // 如果Vue实例的配置对象中有el
      vm.$mount(vm.$options.el) // 挂载Vue实例
    }
  }
}

/**
 *
 * @param {Component} vm Vue实例
 * @param {InternalComponentOptions} options 配置项
 */
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options) // 将全局配置对象赋值给实例配置独享
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode // _parentVnode为当前Vue实例在父实例中的虚拟节点
  opts.parent = options.parent // parent为父Vue实例
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners // 组件在父组件内的虚拟节点监听的事件
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

/**
 * 根据Ctor的父类（如果有）的全局配置，更新并获取全局配置
 * @param {Class<Component>} Ctor Vue构造器
 */
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options // 全局配置对象
  if (Ctor.super) { // 如果Ctor存在父类
    const superOptions = resolveConstructorOptions(Ctor.super) // 获取父类的全局配置对象
    const cachedSuperOptions = Ctor.superOptions // 获取父类的全局配置对象
    if (superOptions !== cachedSuperOptions) { // 父类的全局配置对象不一致
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions // 更新在Ctor中的父类的全局配置对象
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor) // 获取Ctor作为子类时，被变更过的全局配置对象的部分内容
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions) // 更新Ctor的扩展配置
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions) // 合并扩展配置和父类的全局配置，更新Ctor的全局配置
      if (options.name) {
        options.components[options.name] = Ctor // 添加自己添加到自己的全局组件中
      }
    }
  }
  return options
}

/**
 * 获取Ctor作为子类时，被变更过的全局配置对象的部分内容
 * @param {Class<Component>} Ctor Vue构造器
 */
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options // 全局配置对象
  const sealed = Ctor.sealedOptions // 全局配置备份，Ctor作为子类时有
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
