/* @flow */

import VNode, { cloneVNode } from './vnode'
import { createElement } from './create-element'
import { resolveInject } from '../instance/inject'
import { normalizeChildren } from '../vdom/helpers/normalize-children'
import { resolveSlots } from '../instance/render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import { installRenderHelpers } from '../instance/render-helpers/index'

import {
  isDef,
  isTrue,
  hasOwn,
  camelize,
  emptyObject,
  validateProp
} from '../util/index'

/**
 * 函数式渲染上下文构造函数
 * @param {VNodeData} data 组件在父组件中的虚拟节点的数据对象
 * @param {Object} props 组件的属性和属性值的映射关系
 * @param {Array<VNode>} children 子节点
 * @param {Component} parent 组件的父组件
 * @param {Class<Component>} Ctor 组件的构造方法
 */
export function FunctionalRenderContext (
  data: VNodeData,
  props: Object,
  children: ?Array<VNode>,
  parent: Component,
  Ctor: Class<Component>
) {
  const options = Ctor.options // 组件的配置对象
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  let contextVm
  if (hasOwn(parent, '_uid')) { // 父组件实例 有编号
    contextVm = Object.create(parent) // 以父组件实例为原型创建实例
    // $flow-disable-line
    contextVm._original = parent
  } else {
    // the context vm passed in is a functional context as well.
    // in this case we want to make sure we are able to get a hold to the
    // real context instance.
    contextVm = parent
    // $flow-disable-line
    parent = parent._original
  }
  const isCompiled = isTrue(options._compiled)
  const needNormalization = !isCompiled

  this.data = data
  this.props = props
  this.children = children
  this.parent = parent
  this.listeners = data.on || emptyObject
  this.injections = resolveInject(options.inject, parent)
  this.slots = () => {
    if (!this.$slots) {
      normalizeScopedSlots(
        data.scopedSlots,
        this.$slots = resolveSlots(children, parent)
      )
    }
    return this.$slots
  }

  Object.defineProperty(this, 'scopedSlots', ({
    enumerable: true,
    get () {
      return normalizeScopedSlots(data.scopedSlots, this.slots())
    }
  }: any))

  // support for compiled functional template
  if (isCompiled) {
    // exposing $options for renderStatic()
    this.$options = options
    // pre-resolve slots for renderSlot()
    this.$slots = this.slots()
    this.$scopedSlots = normalizeScopedSlots(data.scopedSlots, this.$slots)
  }

  if (options._scopeId) {
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization)
      if (vnode && !Array.isArray(vnode)) {
        vnode.fnScopeId = options._scopeId
        vnode.fnContext = parent
      }
      return vnode
    }
  } else {
    this._c = (a, b, c, d) => createElement(contextVm, a, b, c, d, needNormalization)
  }
}

installRenderHelpers(FunctionalRenderContext.prototype) // 给函数式渲染上下文添加渲染需要用到的原型方法

/**
 * 创建函数式组件实例，返回渲染后的虚拟节点树
 * @param {Class<Component>} Ctor 组件的构造函数
 * @param {Object} propsData 组件属性的绑定对象
 * @param {VNodeData} data 组件在父组件中的虚拟节点的数据对象
 * @param {Component} contextVm 组件在父组件中的虚拟节点的渲染上下文
 * @param {Array<VNode>} children 子组件
 */
export function createFunctionalComponent (
  Ctor: Class<Component>,
  propsData: ?Object,
  data: VNodeData,
  contextVm: Component,
  children: ?Array<VNode>
): VNode | Array<VNode> | void {
  const options = Ctor.options // 取组件配置对象
  const props = {}
  const propOptions = options.props // 取组件的属性配置
  if (isDef(propOptions)) { // 存在属性配置
    for (const key in propOptions) {
      props[key] = validateProp(key, propOptions, propsData || emptyObject) // 获取处理过的属性值，监听和默认值等
    }
  } else { // 组件没有属性配置，则将组件对应的虚拟节点的特性和属性都传入组件
    if (isDef(data.attrs)) mergeProps(props, data.attrs) // 将数据对象中的特性和属性合并到属性结果对象中
    if (isDef(data.props)) mergeProps(props, data.props)
  }

  const renderContext = new FunctionalRenderContext( // 创建函数式渲染上下文对象
    data,
    props,
    children,
    contextVm,
    Ctor
  )

  const vnode = options.render.call(null, renderContext._c, renderContext)

  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(vnode, data, renderContext.parent, options, renderContext) // 复制渲染出的虚拟节点树
  } else if (Array.isArray(vnode)) {
    const vnodes = normalizeChildren(vnode) || []
    const res = new Array(vnodes.length)
    for (let i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(vnodes[i], data, renderContext.parent, options, renderContext) // 复制渲染出的虚拟节点树
    }
    return res
  }
}

/**
 * 复制并返回vnode
 * @param {VNode} vnode 函数式渲染的虚拟节点树
 * @param {VNodeData} data 组件在父组件中的虚拟节点的数据对象
 * @param {Component} contextVm 父组件
 * @param {ComponentOptions} options 组件配置对象
 * @param {FunctionalRenderContext} renderContext 函数式渲染上下文对象
 */
function cloneAndMarkFunctionalResult (vnode, data, contextVm, options, renderContext) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  const clone = cloneVNode(vnode) // 复制虚拟节点树
  clone.fnContext = contextVm
  clone.fnOptions = options
  if (process.env.NODE_ENV !== 'production') {
    (clone.devtoolsMeta = clone.devtoolsMeta || {}).renderContext = renderContext
  }
  if (data.slot) {
    (clone.data || (clone.data = {})).slot = data.slot
  }
  return clone
}

function mergeProps (to, from) {
  for (const key in from) {
    to[camelize(key)] = from[key]
  }
}
