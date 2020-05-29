/* @flow */

import VNode from '../vnode'
import { createFnInvoker } from './update-listeners'
import { remove, isDef, isUndef, isTrue } from 'shared/util'

/**
 * 合并指令和虚拟节点的钩子
 * @param {Object} def 虚拟节点，或虚拟节点的钩子对象
 * @param {string} hookKey 钩子名称
 * @param {Function} hook 钩子的回调函数
 */
export function mergeVNodeHook (def: Object, hookKey: string, hook: Function) {
  if (def instanceof VNode) { // def为虚拟节点
    def = def.data.hook || (def.data.hook = {}) // 取虚拟节点的钩子
  }
  let invoker // 钩子执行器
  const oldHook = def[hookKey] // 取指定钩子的执行器
  /**
   * 执行器为一个函数，该函数有fns属性，为待执行的回调函数列表，还有merged属性
   */

  /**
   * 钩子的回调函数的执行函数
   */
  function wrappedHook () {
    hook.apply(this, arguments) // 执行回调函数
    // important: remove merged hook to ensure it's called only once
    // and prevent memory leak
    remove(invoker.fns, wrappedHook) // 将该函数从钩子回调函数列表中移除
  }

  if (isUndef(oldHook)) { // 虚拟节点中无该钩子
    // no existing hook
    invoker = createFnInvoker([wrappedHook]) // 创建钩子回调函数的执行函数的执行器
  } else {
    /* istanbul ignore if */
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) { // 指定钩子名称的回调函数列表存在，已合并标志为true
      // already a merged invoker
      invoker = oldHook
      invoker.fns.push(wrappedHook) // 将回调函数的执行方法添加到钩子的回调函数列表中
    } else {
      // existing plain hook
      invoker = createFnInvoker([oldHook, wrappedHook]) // 以旧钩子的执行器和回调函数为处理函数列表，创建执行器
    }
  }

  invoker.merged = true // 置已合并标志为true
  def[hookKey] = invoker // 添加到虚拟节点的钩子中
}
