/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

/**
 * 初始化渲染相关的属性
 * @param {Component} vm Vue实例
 */
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options // 配置对象
  const parentVnode = vm.$vnode = options._parentVnode // _parentVnode为当前Vue实例在父实例中的虚拟节点 the placeholder node in parent tree
  const renderContext = parentVnode && parentVnode.context // context为组件在父组件内的虚拟节点渲染的上下文（父组件实例）
  vm.$slots = resolveSlots(options._renderChildren, renderContext) // _renderChildren为组件在父组件内的节点内的子虚拟节点列表。获取插槽名到vnode列表的映射
  vm.$scopedSlots = emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false) // TODO: createElement待深入了解
  // normalization is always applied for the public version, used in
  // user-written render functions.
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data // 组件在父实例中的虚拟节点的VNodeData

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true) // 给vm定义一个响应式（浅响应）属性$attrs，属性值为组件在父实例中的虚拟节点的特性集合 TODO：这个的用意是什么？这个Dep实例对应哪个Watcher实例？
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true) // 给vm定义一个响应式（浅响应）属性$listeners，属性值为组件在父组件内的虚拟节点监听的事件集合
  }
}

export let currentRenderingInstance: Component | null = null // 当前正在渲染的Vue实例

// for testing only
export function setCurrentRenderingInstance (vm: Component) {
  currentRenderingInstance = vm
}

/**
 * 定义Vue原型的$nextTick、_render API
 * @param {Class<Component>} Vue Vue类
 */
export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  /**
   * 注册时间片（下次 DOM 更新循环）结束的回调
   * @param {Function} fn 回调函数
   */
  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this) // 注册时间片（下次 DOM 更新循环）结束的回调
  }

  /**
   * 执行render函数，生成组件的虚拟节点树
   */
  Vue.prototype._render = function (): VNode {
    const vm: Component = this // Vue实例
    const { render, _parentVnode } = vm.$options // 取配置对象中的render方法和组件在父实例中的虚拟节点

    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots( // 标准化插槽内容。标准化成置为插槽名到可以获得插槽内容的虚拟节点列表的函数的映射 TODO：VNodeData的scopedSlots是怎么来的，有些线索：在编译阶段会把插槽相关的编译成_c函数调用的字符串，_c函数就是createElement函数
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode
    // render self
    let vnode
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm
      vnode = render.call(vm._renderProxy, vm.$createElement) // 执行渲染函数，获得组件的虚拟节点树。_renderProxy是vm的代理 TODO：为什么要使用代理
    } catch (e) {
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null
    }
    // if the returned array contains only a single node, allow it
    // 组件的模板只允许有一个根节点，所有渲染结果的数组只有一个元素
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }
    // set parent
    vnode.parent = _parentVnode
    return vnode
  }
}
