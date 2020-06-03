/* @flow */

import { isDef, isUndef } from 'shared/util'
import { updateListeners } from 'core/vdom/helpers/index'
import { isIE, isFF, supportsPassive, isUsingMicroTask } from 'core/util/index'
import { RANGE_TOKEN, CHECKBOX_RADIO_TOKEN } from 'web/compiler/directives/model'
import { currentFlushTimestamp } from 'core/observer/scheduler'

// normalize v-model event tokens that can only be determined at runtime.
// it's important to place the event as the first in the array because
// the whole point is ensuring the v-model callback gets called before
// user-attached handlers.
/**
 * 标准化事件
 * @param {Object} on 事件监听对象，即事件名称到事件处理方法的映射
 */
function normalizeEvents (on) {
  /* istanbul ignore if */
  if (isDef(on[RANGE_TOKEN])) { // RANGE_TOKEN是__r，合并__r与change（或input）事件 TODO: __r是什么意思？
    // IE input[type=range] only supports `change` event
    const event = isIE ? 'change' : 'input'
    on[event] = [].concat(on[RANGE_TOKEN], on[event] || [])
    delete on[RANGE_TOKEN]
  }
  // This was originally intended to fix #4521 but no longer necessary
  // after 2.5. Keeping it for backwards compat with generated code from < 2.4
  /* istanbul ignore if */
  if (isDef(on[CHECKBOX_RADIO_TOKEN])) { // CHECKBOX_RADIO_TOKEN是__c
    on.change = [].concat(on[CHECKBOX_RADIO_TOKEN], on.change || []) // 合并__c与change事件 TODO: __c是什么意思？
    delete on[CHECKBOX_RADIO_TOKEN]
  }
}

let target: any

/**
 * updateListeners方法使用的一次性事件处理函数的工厂
 * @param {string} event DOM事件的事件名
 * @param {Function} handler DOM事件的处理方法
 * @param {boolean} capture 捕获阶段处理事件标志
 */
function createOnceHandler (event, handler, capture) {
  const _target = target // 闭包保留事件的DOM节点。save current target element in closure
  return function onceHandler () { // 一次性事件处理函数
    const res = handler.apply(null, arguments)
    if (res !== null) {
      remove(event, onceHandler, capture, _target)
    }
  }
}

// #9446: Firefox <= 53 (in particular, ESR 52) has incorrect Event.timeStamp
// implementation and does not fire microtasks in between event propagation, so
// safe to exclude.
const useMicrotaskFix = isUsingMicroTask && !(isFF && Number(isFF[1]) <= 53) // 任务队列是Microtasks，而非Macrotasks。不是Firefox吗，或firefox版本大于53 TODO: Microtasks任务队列是什么?

/**
 * updateListeners方法使用的注册事件的回调方法
 * @param {string} name DOM事件的事件名
 * @param {Function} handler DOM事件的处理方法
 * @param {boolean} capture 捕获阶段处理事件标志
 * @param {boolean} passive 不会调用 preventDefault() 的标志
 */
function add (
  name: string,
  handler: Function,
  capture: boolean,
  passive: boolean
) {
  // async edge case #6566: inner click event triggers patch, event handler
  // attached to outer element during patch, and triggered again. This
  // happens because browsers fire microtask ticks between event propagation.
  // the solution is simple: we save the timestamp when a handler is attached,
  // and the handler would only fire if the event passed to it was fired
  // AFTER it was attached.
  if (useMicrotaskFix) { // 使用Microtask任务队列
    const attachedTimestamp = currentFlushTimestamp // 最新一次调度程序执行开始的时间戳
    const original = handler
    handler = original._wrapper = function (e) { // 包装事件处理方法
      if (
        // no bubbling, should always fire.
        // this is just a safety net in case event.timeStamp is unreliable in
        // certain weird environments...
        e.target === e.currentTarget || // 避免事件传播引起的额外事件监听
        // event is fired after handler attachment
        e.timeStamp >= attachedTimestamp || // 事件发生的时间戳大于最新一次调度程序执行开始的时间戳，即在调度程序开始之后触发的事件 TODO：这个是什么意思
        // bail for environments that have buggy event.timeStamp implementations
        // #9462 iOS 9 bug: event.timeStamp is 0 after history.pushState
        // #9681 QtWebEngine event.timeStamp is negative value
        e.timeStamp <= 0 || // 处理不同平台的Bug
        // #9448 bail if event is fired in another document in a multi-page
        // electron/nw.js app, since event.timeStamp will be using a different
        // starting reference
        e.target.ownerDocument !== document // 事件不是当前文档产生的事件
      ) {
        return original.apply(this, arguments)
      }
    }
  }
  target.addEventListener( // 添加事件监听
    name,
    handler,
    supportsPassive
      ? { capture, passive }
      : capture
  )
}

/**
 * updateListeners方法使用的注销事件的回调方法
 * @param {string} name DOM事件的事件名
 * @param {Function} handler DOM事件的处理方法
 * @param {boolean} capture 捕获阶段处理事件标志
 * @param {HTMLElement} _target 产生name事件的DOM节点
 */
function remove (
  name: string,
  handler: Function,
  capture: boolean,
  _target?: HTMLElement
) {
  (_target || target).removeEventListener( // 删除事件处理方法
    name,
    handler._wrapper || handler,
    capture
  )
}

/**
 * 创建、更新虚拟节点的事件监听
 * @param {VNode} oldVnode 旧虚拟节点
 * @param {VNode} vnode 新虚拟节点
 */
function updateDOMListeners (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) { // 虚拟节点有事件监听
    return
  }
  const on = vnode.data.on || {} // 新虚拟节点的事件监听对象
  const oldOn = oldVnode.data.on || {} // 旧虚拟节点的事件监听对象
  target = vnode.elm // 新虚拟节点的渲染结果
  normalizeEvents(on) // 标准化事件
  updateListeners(on, oldOn, add, remove, createOnceHandler, vnode.context) // 新增、更新或删除事件监听
  target = undefined
}

export default {
  create: updateDOMListeners,
  update: updateDOMListeners
}
