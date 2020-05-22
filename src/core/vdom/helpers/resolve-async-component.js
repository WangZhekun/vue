/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

/**
 * 获取组件的构造函数
 * @param {any} comp 组件的模块
 * @param {Class<Component>} base 组件的父组件的构造函数
 */
function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) { // comp是模块
    comp = comp.default // 取模块的默认导出
  }
  return isObject(comp) // 如果comp是对象
    ? base.extend(comp) // 创建base的子类
    : comp
}

/**
 * 创建空的虚拟节点，用于给组件构造函数的异步工厂函数占位
 * @param {Function} factory 组件构造函数的工厂函数
 * @param {VNodeData} data 组件在父组件内的虚拟节点的数据对象
 * @param {Component} context 组件在父组件内的虚拟节点的上下文
 * @param {Array<VNode>} children 子节点
 * @param {string} tag 节点名称
 */
export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

/**
 * 处理异步工厂函数
 * @param {Function} factory 子类构造函数的工厂函数 TODO：工厂函数的属性在哪里添加的
 * @param {Class<Component>} baseCtor 父类构造函数
 */
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  const owner = currentRenderingInstance // 当前正在渲染的Vue实例
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) { // 维护组件的构造函数的工厂函数与正在渲染的Vue实例的从属关系
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true // 同步标志，默认是同步的，即在执行factory时同步执行resolve
    let timerLoading = null
    let timerTimeout = null

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner)) // 给正在渲染的Vue实例定义事件，在其销毁时断开与当前组件构造函数的工厂函数的从属关系

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) { // 执行拥有该组件构造函数的工厂函数的Vue实例的$forceUpdate
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) { // 清除定时器
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    /**
     * 该函数只会被执行一次
     */
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor) // 获取组件的构造函数
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 在服务端渲染时，异步会被当做同步处理
      if (!sync) { // 异步
        forceRender(true) // 执行拥有该组件构造函数的工厂函数的Vue实例的$forceUpdate
      } else {
        owners.length = 0 // 清空从属关系
      }
    })

    /**
     * 该函数只会被执行一次
     */
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true) // 执行拥有该组件构造函数的工厂函数的Vue实例的$forceUpdate
      }
    })

    const res = factory(resolve, reject) // 执行组件构造函数的工厂函数

    if (isObject(res)) { // 结果为对象
      if (isPromise(res)) { // 结果为Promise对象
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) { // 结果的component属性为Promise对象
        res.component.then(resolve, reject)

        if (isDef(res.error)) { // 工厂函数执行错误
          factory.errorComp = ensureCtor(res.error, baseCtor) // TODO：这个干什么
        }

        if (isDef(res.loading)) { // 工厂函数中包含异步操作
          factory.loadingComp = ensureCtor(res.loading, baseCtor) // TODO：这个干什么
          if (res.delay === 0) { // 延迟为0
            factory.loading = true
          } else {
            timerLoading = setTimeout(() => { // 延迟指定时间或200ms后执行forceRender
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false) // 执行拥有该组件构造函数的工厂函数的Vue实例的$forceUpdate。不清除定时器
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) { // 工厂函数中有异步操作，且有超时设置
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false // 异步
    // return in case resolved synchronously
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
