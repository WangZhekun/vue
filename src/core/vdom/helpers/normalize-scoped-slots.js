/* @flow */

import { def } from 'core/util/lang'
import { normalizeChildren } from 'core/vdom/helpers/normalize-children'
import { emptyObject } from 'shared/util'

/**
 * 标准化插槽内容。标准化成置为插槽名到可以获得插槽内容的虚拟节点列表的函数的映射
 * @param {{ [key: string]: Function } | void} slots 组件在父实例中的虚拟节点的VNodeData的scopedSlots
 * @param {{ [key: string]: Array<VNode> }} normalSlots 未处理的插槽，组件实例中的插槽名到vnode列表的映射
 * @param {{ [key: string]: Function } | void} prevSlots
 */
export function normalizeScopedSlots (
  slots: { [key: string]: Function } | void,
  normalSlots: { [key: string]: Array<VNode> },
  prevSlots?: { [key: string]: Function } | void
): any {
  let res
  const hasNormalSlots = Object.keys(normalSlots).length > 0
  const isStable = slots ? !!slots.$stable : !hasNormalSlots //
  const key = slots && slots.$key
  if (!slots) {
    res = {}
  } else if (slots._normalized) {
    // fast path 1: child component re-render only, parent did not change
    return slots._normalized
  } else if (
    isStable &&
    prevSlots &&
    prevSlots !== emptyObject &&
    key === prevSlots.$key &&
    !hasNormalSlots &&
    !prevSlots.$hasNormal
  ) {
    // fast path 2: stable scoped slots w/ no normal slots to proxy,
    // only need to normalize once
    return prevSlots
  } else {
    res = {}
    for (const key in slots) {
      if (slots[key] && key[0] !== '$') {
        res[key] = normalizeScopedSlot(normalSlots, key, slots[key]) // 获取可以获取标准化未处理插槽的key的内容列表的函数
      }
    }
  }
  // expose normal slots on scopedSlots
  for (const key in normalSlots) { // 遍历未处理的插槽列表
    if (!(key in res)) { // 如果属性名不在结果对象中，即normalSlots - slots的差集
      res[key] = proxyNormalSlot(normalSlots, key) // 代理未处理插槽。获取可以返回指定插槽名的vnode列表的函数
    }
  }
  // avoriaz seems to mock a non-extensible $scopedSlots object
  // and when that is passed down this would cause an error
  if (slots && Object.isExtensible(slots)) { // slots可扩展
    (slots: any)._normalized = res
  }
  def(res, '$stable', isStable)
  def(res, '$key', key)
  def(res, '$hasNormal', hasNormalSlots)
  return res
}

/**
 * 获取可以获取指定插槽名的标准化后的插槽内容函数
 * 该函数可以标准化指定插槽名的插槽内容列表，但无内容或内容都是注释节点是返回undefined
 * @param {{ [key: string]: Array<VNode> }} normalSlots 未处理插槽
 * @param {string} key 插槽名
 * @param {Function} fn 标准化后的，可以获得指定插槽名的vnode列表的函数
 */
function normalizeScopedSlot(normalSlots, key, fn) {
  const normalized = function () {
    let res = arguments.length ? fn.apply(null, arguments) : fn({}) // 获取normalSlots中key属性的值
    res = res && typeof res === 'object' && !Array.isArray(res)
      ? [res] // single vnode
      : normalizeChildren(res) // 标准化插槽内容列表，即将列表元素转化为虚拟节点，但列表元素为v-for列表时特殊处理
    return res && (
      res.length === 0 ||
      (res.length === 1 && res[0].isComment) // #9658
    ) ? undefined
      : res
  }
  // this is a slot using the new v-slot syntax without scope. although it is
  // compiled as a scoped slot, render fn users would expect it to be present
  // on this.$slots because the usage is semantically a normal slot.
  if (fn.proxy) {
    Object.defineProperty(normalSlots, key, {
      get: normalized,
      enumerable: true,
      configurable: true
    })
  }
  return normalized
}

/**
 * 代理未处理插槽。获取可以返回指定插槽名的vnode列表的函数
 * @param {{ [key: string]: Array<VNode> }} slots 插槽名到vnode列表的映射
 * @param {string} key 插槽名
 */
function proxyNormalSlot(slots, key) {
  return () => slots[key]
}
