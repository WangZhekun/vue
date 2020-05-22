/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
/**
 * 创建虚拟节点
 * @param {Component} context Vue实例，创建的虚拟节点的上下文
 * @param {any} tag 节点标签名
 * @param {any} data 节点特性
 * @param {any} children 子节点
 * @param {any} normalizationType
 * @param {boolean} alwaysNormalize
 */
export function createElement (
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType) // 创建虚拟节点
}

/**
 * 创建虚拟节点
 * @param {Component} context Vue实例，创建的虚拟节点的上下文
 * @param {string | Class<Component> | Function | Object} tag 节点标签名
 * @param {VNodeData} data 虚拟节点的数据对象
 * @param {any} children 子节点
 * @param {number} normalizationType 子节点标准化方式
 */
export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }
  // object syntax in v-bind
  if (isDef(data) && isDef(data.is)) { // is特性，动态组件模板
    tag = data.is
  }
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot TODO: 这是在干什么
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children) // 标准化子节点列表，即将列表元素转化为虚拟节点，但元素为v-for列表时特殊处理
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    children = simpleNormalizeChildren(children) /// 简单标准化子节点列表，将children中为数组的元素拆分
  }
  let vnode, ns
  if (typeof tag === 'string') { // tag是字符串
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    if (config.isReservedTag(tag)) { // tag是平台预留tag
      // platform built-in elements
      if (process.env.NODE_ENV !== 'production' && isDef(data) && isDef(data.nativeOn)) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      vnode = new VNode( // 创建tag对应的虚拟节点
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) { // data.pre表示跳过编译阶段。获取tag组件的注册对象
      // component
      vnode = createComponent(Ctor, data, context, children, tag) // 创建tag组件的占位虚拟节点
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode( // 创建指定名称的虚拟节点
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else { // tag是组件的配置对象或构造函数
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children) // 创建tag组件的占位虚拟节点
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns) // 给组件的占位虚拟节点添加命名空间
    if (isDef(data)) registerDeepBindings(data) // 收集虚拟节点的style和class的Dep，占位虚拟节点所在的父组件的
    return vnode
  } else {
    return createEmptyVNode()
  }
}

/**
 * 给虚拟节点添加命名空间
 * TODO：虚拟节点的命名空间是什么？
 * @param {VNode} vnode 组件的占位虚拟节点
 * @param {*} ns
 * @param {boolean} force
 */
function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
/**
 * 收集虚拟节点的style和class的Dep
 * TODO：此处收集依赖的Watcher是谁
 * @param {VNodeData} data 虚拟节点的数据对象
 */
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
