/* @flow */

import {
  warn,
  invokeWithErrorHandling
} from 'core/util/index'
import {
  cached,
  isUndef,
  isTrue,
  isPlainObject
} from 'shared/util'

/**
 * 带缓存的事件名解析函数
 */
const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>
} => {
  const passive = name.charAt(0) === '&'
  name = passive ? name.slice(1) : name
  const once = name.charAt(0) === '~' // Prefixed last, checked first
  name = once ? name.slice(1) : name
  const capture = name.charAt(0) === '!'
  name = capture ? name.slice(1) : name
  return {
    name,
    once,
    capture,
    passive
  }
})

/**
 * 创建fns的执行函数
 * @param {Function | Array<Function>} fns 事件处理方法
 * @param {Component} vm Vue实例
 */
export function createFnInvoker (fns: Function | Array<Function>, vm: ?Component): Function {
  function invoker () {
    const fns = invoker.fns // 自定义的事件处理方法
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        invokeWithErrorHandling(cloned[i], null, arguments, vm, `v-on handler`) // 执行事件处理方法
      }
    } else {
      // return handler return value for single handlers
      return invokeWithErrorHandling(fns, null, arguments, vm, `v-on handler`) // 执行事件处理方法
    }
  }
  invoker.fns = fns // 自定义的事件处理方法
  return invoker
}

/**
 * 新增、更新或删除事件监听
 * 可能会调用createFnInvoker将事件处理函数重新成有fns属性的函数，fns为原始的事件处理函数。被修改后的事件处理函数会被$on注册。
 * @param {Object} on // 组件被监听的事件
 * @param {Object} oldOn // 组件被监听的旧的事件
 * @param {Function} add // vm.$on的回调
 * @param {Function} remove // vm.$off的回调
 * @param {Function} createOnceHandler // 一次性事件监听工厂函数
 * @param {Component} vm // 当前更新事件监听的Vue实例
 */
export function updateListeners (
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  createOnceHandler: Function,
  vm: Component
) {
  let name, def, cur, old, event
  for (name in on) { // 遍历新事件，新增或更新事件监听
    def = cur = on[name] // 当前事件名的映射值
    old = oldOn[name] // 旧事件名的映射值
    event = normalizeEvent(name) // 解析事件名
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) { // weex，且事件名的映射值是纯对象
      cur = def.handler
      event.params = def.params // 事件参数
    }
    if (isUndef(cur)) { // 当前事件为空
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    } else if (isUndef(old)) { // 旧事件为空，及新增事件监听
      if (isUndef(cur.fns)) { // 当前事件的fns为空，即cur为事件处理函数，或事件处理函数的数组。被处理过的事件处理方法，为包含fns方法的Function实例
        cur = on[name] = createFnInvoker(cur, vm) // 创建fns的执行函数
      }
      if (isTrue(event.once)) { // 当前事件为一次性事件
        cur = on[name] = createOnceHandler(event.name, cur, event.capture) // 创建一次性事件处理函数
      }
      add(event.name, cur, event.capture, event.passive, event.params) // 执行vm.$on的回调，注册事件处理方法
    } else if (cur !== old) { // 有旧事件映射值，且与新事件映射值不等，更新之
      old.fns = cur // 更新旧事件的执行函数
      on[name] = old
    }
  }
  for (name in oldOn) { // 遍历旧事件
    if (isUndef(on[name])) { // 不存在新事件
      event = normalizeEvent(name) // 解析事件名
      remove(event.name, oldOn[name], event.capture) // 执行vm.$off的回调，取消事件注册
    }
  }
}
