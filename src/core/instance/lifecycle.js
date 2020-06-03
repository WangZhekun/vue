/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null // 正在激活的Vue实例
export let isUpdatingChildComponent: boolean = false

/**
 * 设置正在激活的Vue实例
 * @param {Component} vm Vue实例
 */
export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}

/**
 * 初始化Vue实例的生命周期相关的属性
 * @param {Component} vm Vue实例
 */
export function initLifecycle (vm: Component) {
  const options = vm.$options // 配置对象

  // locate first non-abstract parent
  let parent = options.parent // 父Vue实例
  if (parent && !options.abstract) { // 将当前实例添加到父实例的$children中。父实例为祖上第一个非抽象组件（abstract属性，keep-alive就是抽象组件，不渲染DOM，也不会出现在父组件链中）。
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    parent.$children.push(vm)
  }

  vm.$parent = parent // 父实例
  vm.$root = parent ? parent.$root : vm // 根Vue实例

  vm.$children = [] // 子实例列表
  vm.$refs = {} // 引用

  vm._watcher = null // 组件模板对应的Watcher实例
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

/**
 * 定义Vue原型的_update、$forceUpdate、$destroy API
 * @param {Class<Component>} Vue Vue类
 */
export function lifecycleMixin (Vue: Class<Component>) {
  /**
   * 更新虚拟节点树，并重新渲染
   * @param {VNode} vnode 虚拟节点树
   * @param {boolean} hydrating 是否将DOM节点与vnode关联
   */
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this // Vue实例
    const prevEl = vm.$el // 挂载点
    const prevVnode = vm._vnode // 虚拟节点树
    const restoreActiveInstance = setActiveInstance(vm) // 设置正在激活的Vue实例为当前实例
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) { // 无虚拟节点树
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */) // 创建VNode树 - 第一次渲染
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode) // 创建VNode树 - 更新渲染
    }
    restoreActiveInstance() // 恢复正在激活的Vue实例
    // update __vue__ reference
    if (prevEl) { // 清空原渲染结果的Vue实例引用
      prevEl.__vue__ = null
    }
    if (vm.$el) { // 置渲染结果的Vue实例引用
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) { // 当前Vue实例的虚拟节点树与父实例的一样，则渲染结果也要一样
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  /**
   * 强制更新。通过当前Vue实例的组件模板对应的Watcher实例的update方法，通知Watcher实例更新。
   */
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) { // 当前Vue实例的组件模板对应的Watcher实例存在
      vm._watcher.update()
    }
  }

  /**
   * 销毁Vue实例
   */
  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) { // 已经开始执行销毁操作
      return
    }
    callHook(vm, 'beforeDestroy') // 执行beforeDestroy钩子
    vm._isBeingDestroyed = true // 置销毁操作标志为true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) { // 存在父实例，且父实例不是在销毁中，且当前Vue实例不是抽象组件（keep-alive是抽象组件，不渲染DOM，也不会出现在父组件链中）
      remove(parent.$children, vm) // 将当前Vue实例，从其父实例的children列表中移除
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown() // 将主Watcher实例从Dep实例的订阅者列表中移除，从Vue实例的watcher列表中移除
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown() // 依次将Watcher实例从Dep实例的订阅者列表中移除，从Vue实例的Watcher列表中移除
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) { // 如果响应式数据对象中有Observer实例
      vm._data.__ob__.vmCount-- // 将Observer实例监听的响应式数据对象作为根数据对象的计数器减一
    }
    // call the last hook...
    vm._isDestroyed = true // 销毁完成
    // invoke destroy hooks on current rendered tree
    vm.__patch__(vm._vnode, null) // 删除虚拟节点树
    // fire destroyed hook
    callHook(vm, 'destroyed') // 执行destroyed钩子
    // turn off all instance listeners.
    vm.$off() // 清空事件监听
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null // 移除渲染结果的Vue实例引用
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null // 释放虚拟节点树对父节点的引用
    }
  }
}

/**
 * 创建模板对应的Watcher实例，完成模板渲染
 * @param {Component} vm Vue实例
 * @param {Element} el 挂载点
 * @param {boolean} hydrating
 */
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  vm.$el = el
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode // 如果不存在render函数，则将其置为创建空节点函数
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  callHook(vm, 'beforeMount') // 触发beforeMount生命周期钩子

  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => { // 该方法作为Watcher实例的getter方法，完成了模板中所有绑定数据的getter访问
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 创建Watcher实例，在该类的构造函数内，关联Watcher实例与当前Vue实例的关联关系
  new Watcher(vm, updateComponent, noop, {
    before () { // Watcher更新数据前的回调函数
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) { // TODO: $vnode什么情况下为null
    vm._isMounted = true
    callHook(vm, 'mounted') // 挂载结束，触发mounted生命周期钩子
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode // _parentVnode为当前Vue实例在父实例中的虚拟节点
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

/**
 * 激活keep-alive缓存的组件树
 * @param {Component} vm Vue实例
 * @param {boolean} direct
 */
export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) { // 组件不活跃
    vm._inactive = false // 激活
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

/**
 * 使keep-alive缓存的组件树失活
 * @param {Component} vm Vue实例
 * @param {boolean} direct
 */
export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

/**
 * 执行vm上指定的钩子列表
 * @param {Component} vm Vue实例
 * @param {string} hook 钩子名称
 */
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  const handlers = vm.$options[hook] // 取hook对应的钩子列表
  const info = `${hook} hook`
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) { // 遍历钩子
      invokeWithErrorHandling(handlers[i], vm, null, vm, info) // 执行钩子
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook) // 触发事件
  }
  popTarget()
}
