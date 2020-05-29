/* @flow */

import {
  isDef,
  isUndef
} from 'shared/util'

import {
  concat,
  stringifyClass,
  genClassForVnode
} from 'web/util/index'

/**
 * 更新class
 * @param {any} oldVnode 旧虚拟节点
 * @param {any} vnode 新虚拟节点
 */
function updateClass (oldVnode: any, vnode: any) {
  const el = vnode.elm // 取DOM树
  const data: VNodeData = vnode.data
  const oldData: VNodeData = oldVnode.data
  if (
    isUndef(data.staticClass) &&
    isUndef(data.class) && (
      isUndef(oldData) || (
        isUndef(oldData.staticClass) &&
        isUndef(oldData.class)
      )
    )
  ) { // 无class或staticClass
    return
  }

  let cls = genClassForVnode(vnode) // 生成虚拟节点的class

  // handle transition classes
  const transitionClass = el._transitionClasses // 过渡动画class
  if (isDef(transitionClass)) {
    cls = concat(cls, stringifyClass(transitionClass)) // 合并过渡动画class
  }

  // set the class
  if (cls !== el._prevClass) {
    el.setAttribute('class', cls) // 设置class特性
    el._prevClass = cls // 设置class备份
  }
}

export default {
  create: updateClass, // 更新class
  update: updateClass // 更新class
}
