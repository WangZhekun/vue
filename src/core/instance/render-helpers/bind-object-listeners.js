/* @flow */

import { warn, extend, isPlainObject } from 'core/util/index'

/**
 * 将v-on绑定的事件对象合并到虚拟节点的数据对象中
 * @param {any} data 虚拟节点的数据对象
 * @param {any} value v-on绑定的事件对象
 */
export function bindObjectListeners (data: any, value: any): VNodeData {
  if (value) {
    if (!isPlainObject(value)) {
      process.env.NODE_ENV !== 'production' && warn(
        'v-on without argument expects an Object value',
        this
      )
    } else { // value是纯对象
      const on = data.on = data.on ? extend({}, data.on) : {} // 将事件监听配置对象转为非响应式对象
      for (const key in value) {
        const existing = on[key]
        const ours = value[key]
        on[key] = existing ? [].concat(existing, ours) : ours // 合并事件监听
      }
    }
  }
  return data
}
