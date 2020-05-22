/* @flow */

import type VNode from 'core/vdom/vnode'

/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 */
/**
 * 获取插槽名到vnode列表的映射
 * @param {Array<VNode>} children 组件在父组件内的节点内的子虚拟节点列表
 * @param {Component} context 渲染上下文（Vue实例）
 */
export function resolveSlots (
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) { // 子节点为空，即没有插槽内容
    return {}
  }
  const slots = {}
  for (let i = 0, l = children.length; i < l; i++) { // 遍历子虚拟节点
    const child = children[i]
    const data = child.data
    // 如果节点是插槽节点，则删除slot特性 remove slot attribute if the node is resolved as a Vue slot node TODO：为什么要删除
    if (data && data.attrs && data.attrs.slot) { // 节点特性中包含slot TODO：这里的slot特性是节点上的v-slot指令？
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) { // 具名插槽
      const name = data.slot // TODO：需要找到data.slot是怎么来的
      const slot = (slots[name] || (slots[name] = []))
      if (child.tag === 'template') { // 子节点是<template>
        slot.push.apply(slot, child.children || [])
      } else {
        slot.push(child)
      }
    } else {
      (slots.default || (slots.default = [])).push(child) // 默认插槽
    }
  }
  // ignore slots that contains only whitespace
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) { // 如果插槽的内容都是空白节点，则删除插槽
      delete slots[name]
    }
  }
  return slots // 返回各插槽名到vnode列表的映射
}

function isWhitespace (node: VNode): boolean {
  return (node.isComment && !node.asyncFactory) || node.text === ' '
}
