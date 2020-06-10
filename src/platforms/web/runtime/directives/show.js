/* @flow */

import { enter, leave } from '../modules/transition'

// recursively search for possible transition defined inside the component root
/**
 * 向下递归搜索在组件根节点有过渡效果的节点，直到根节点为非组件的占位节点
 * @param {VNode} vnode 虚拟节点
 */
function locateNode (vnode: VNode): VNodeWithData {
  return vnode.componentInstance && (!vnode.data || !vnode.data.transition) // 虚拟节点是占位节点，且虚拟节点的数据对象不存在或不存在过渡效果
    ? locateNode(vnode.componentInstance._vnode) // 向下递归，返回占位节点对应的组件的根虚拟节点（实际的非组件节点）
    : vnode
}

export default {
  bind (el: any, { value }: VNodeDirective, vnode: VNodeWithData) {
    vnode = locateNode(vnode) // 向下递归取有过渡效果的组件根节点，或普通节点
    const transition = vnode.data && vnode.data.transition // 占位节点上的属性和事件
    const originalDisplay = el.__vOriginalDisplay =
      el.style.display === 'none' ? '' : el.style.display // 指令绑定的DOM元素的display样式，如果display为none，则取空串
    if (value && transition) { // 绑定值为真值，且存在过渡效果
      vnode.data.show = true // 置v-show为true
      enter(vnode, () => { // 开始节点进入的过渡效果
        el.style.display = originalDisplay
      })
    } else { // 绑定值为非真值，或无过渡效果
      el.style.display = value ? originalDisplay : 'none' // 置节点的display样式
    }
  },

  update (el: any, { value, oldValue }: VNodeDirective, vnode: VNodeWithData) {
    /* istanbul ignore if */
    if (!value === !oldValue) return // 新值和旧值都为假值
    vnode = locateNode(vnode) // 向下递归取有过渡效果的组件根节点，或普通节点
    const transition = vnode.data && vnode.data.transition // 占位节点上的属性和事件
    if (transition) { // 有过渡
      vnode.data.show = true // 置v-show为true
      if (value) { // 绑定值为真值
        enter(vnode, () => { // 开始节点进入的过渡效果
          el.style.display = el.__vOriginalDisplay
        })
      } else { // 绑定值为假值
        leave(vnode, () => { // 开始节点离开的过渡效果
          el.style.display = 'none'
        })
      }
    } else { // 无过渡
      el.style.display = value ? el.__vOriginalDisplay : 'none'
    }
  },

  unbind (
    el: any,
    binding: VNodeDirective,
    vnode: VNodeWithData,
    oldVnode: VNodeWithData,
    isDestroy: boolean
  ) {
    if (!isDestroy) { // 未销毁
      el.style.display = el.__vOriginalDisplay // 置display
    }
  }
}
