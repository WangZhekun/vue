/* @flow */

import { isDef } from 'shared/util'
import { isAsyncPlaceholder } from './is-async-placeholder'

/**
 * 获取子组件中第一个组件的占位节点
 * @param {Array<VNode>} children
 */
export function getFirstComponentChild (children: ?Array<VNode>): ?VNode {
  if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) { // 遍历子节点
      const c = children[i]
      if (isDef(c) && (isDef(c.componentOptions) || isAsyncPlaceholder(c))) { // 子节点有对应组件的配置对象，或是异步占位节点
        return c
      }
    }
  }
}
