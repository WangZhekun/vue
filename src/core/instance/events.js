/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

/**
 * 初始化组件的事件监听
 * 最终是用$on、$off完成的事件注册。
 * 可能会调用createFnInvoker将事件处理函数重新成有fns属性的函数，fns为原始的事件处理函数。被修改后的事件处理函数会被$on注册。
 * @param {Component} vm Vue实例
 */
export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners // 组件在父组件内的虚拟节点监听的事件
  if (listeners) {
    updateComponentListeners(vm, listeners) // 新增组件的事件监听。可能会调用createFnInvoker将事件处理函数重新成有fns属性的函数，fns为原始的事件处理函数。被修改后的事件处理函数会被$on注册。
  }
}

let target: any // 当前正在更新事件监听的Vue实例

/**
 * 调用vm.$on
 */
function add (event, fn) {
  target.$on(event, fn)
}

/**
 * 调用vm.$off
 * @param {string} event 事件名
 * @param {Function | Array<Function>} fn 事件处理方法
 */
function remove (event, fn) {
  target.$off(event, fn)
}

/**
 * 一次性事件监听工厂函数
 * @param {string} event 事件名称
 * @param {Function | Array<Function>} fn 事件处理方法
 */
function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () { // TODO：这里为什么不跟add一样，直接调用$once
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

/**
 * 新增、更新或删除组件的事件监听
 * 最终是用$on、$off完成的事件注册。
 * 可能会调用createFnInvoker将事件处理函数重新成有fns属性的函数，fns为原始的事件处理函数。被修改后的事件处理函数会被$on注册。
 * @param {Component} vm Vue实例
 * @param {Object} listeners 组件被监听的事件
 * @param {Object} oldListeners 组件被监听的旧的事件
 */
export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm // 将vm设置为当前的操作目标，在add、remove、createOnceHandler回调中使用
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm) // 新增、更新或删除事件监听。可能会调用createFnInvoker将事件处理函数重新成有fns属性的函数，fns为原始的事件处理函数。被修改后的事件处理函数会被$on注册。
  target = undefined
}

/**
 * 定义Vue原型的$on、$once、$off、$emit API
 * @param {Class<Component>} Vue Vue类
 */
export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  /**
   * Vue实例的新增事件监听API
   * @param {string | Array<string>} event 事件名
   * @param {Function} fn 事件处理函数
   */
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this // Vue实例
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) { // 事件名为数组，遍历之，依次调用$on
        vm.$on(event[i], fn)
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn) // 如果vm中已经存在该事件的处理方法，则将当前处理函数加入队列
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) { // 测试事件名是否以hook:开头
        vm._hasHookEvent = true // 置标志
      }
    }
    return vm
  }

  /**
   * Vue实例的新增一次性事件监听API
   * @param {string | Array<string>} event 事件名
   * @param {Function} fn 事件处理函数
   */
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this // Vue实例
    function on () {
      vm.$off(event, on) // 取消事件注册
      fn.apply(vm, arguments) // 执行事件处理方法
    }
    on.fn = fn
    vm.$on(event, on) // 注册事件监听
    return vm
  }

  /**
   * Vue实例的取消事件监听API
   * @param {string | Array<string>} event 事件名
   * @param {Function} fn 注册event事件时的处理方法
   */
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this // Vue实例
    // all
    if (!arguments.length) { // 无参数，即清空所有事件监听
      vm._events = Object.create(null) // 清空所有事件监听
      return vm
    }
    // array of events
    if (Array.isArray(event)) { // 事件名为数组，遍历之，依次调用$off
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event] // 获取event事件的处理方法的集合
    if (!cbs) { // 校验事件处理方法的存在性
      return vm
    }
    if (!fn) { // 不存在回调
      vm._events[event] = null
      return vm
    }
    // specific handler
    let cb
    let i = cbs.length
    while (i--) { // 倒序遍历事件处理方法的集合，先进后出
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) { // cb可能直接是event的事件处理方法，也可能是经过$once中处理的事件处理方法，即有fn属性的函数
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  /**
   * Vue实例的触发事件API
   * @param {string} event 事件名
   */
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this // Vue实例
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    let cbs = vm._events[event] // 取事件处理函数队列
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1) // 取$emit除第一个参数外的其他参数
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) { // 遍历并执行队列
        invokeWithErrorHandling(cbs[i], vm, args, vm, info) // 执行事件处理方法，参数为$emit除第一个参数之外的其他参数
      }
    }
    return vm
  }
}
