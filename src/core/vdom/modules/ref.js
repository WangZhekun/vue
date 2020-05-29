/* @flow */

import { remove, isDef } from 'shared/util'

export default {
  create (_: any, vnode: VNodeWithData) {
    registerRef(vnode) // 注册引用
  },
  update (oldVnode: VNodeWithData, vnode: VNodeWithData) {
    if (oldVnode.data.ref !== vnode.data.ref) { // 新旧虚拟节点的引用名称发生变化
      registerRef(oldVnode, true) // 删除旧虚拟节点的引用
      registerRef(vnode) // 注册新虚拟节点的引用
    }
  },
  destroy (vnode: VNodeWithData) {
    registerRef(vnode, true) // 删除引用
  }
}

/**
 * 引用注册，或删除
 * @param {VNodeWithData} vnode 待注册（删除）的虚拟节点
 * @param {boolean} isRemoval 删除标志
 */
export function registerRef (vnode: VNodeWithData, isRemoval: ?boolean) {
  const key = vnode.data.ref
  if (!isDef(key)) return

  const vm = vnode.context
  const ref = vnode.componentInstance || vnode.elm
  const refs = vm.$refs
  if (isRemoval) {
    if (Array.isArray(refs[key])) {
      remove(refs[key], ref)
    } else if (refs[key] === ref) {
      refs[key] = undefined
    }
  } else {
    if (vnode.data.refInFor) {
      if (!Array.isArray(refs[key])) {
        refs[key] = [ref]
      } else if (refs[key].indexOf(ref) < 0) {
        // $flow-disable-line
        refs[key].push(ref)
      }
    } else {
      refs[key] = ref
    }
  }
}
