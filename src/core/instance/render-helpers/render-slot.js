/* @flow */

import { extend, warn, isObject } from 'core/util/index'

/**
 * Runtime helper for rendering <slot>
 */
/**
 * 插槽渲染
 * @param {string} name 插槽名
 * @param {Array<VNode>} fallback 当无法从$slots或$scopedSlots获得插槽内容时，从该函数获取
 * @param {Object} props
 * @param {Object} bindObject
 */
export function renderSlot (
  name: string,
  fallback: ?Array<VNode>,
  props: ?Object,
  bindObject: ?Object
): ?Array<VNode> {
  const scopedSlotFn = this.$scopedSlots[name] // 获取name插槽的可以获得虚拟节点列表的函数
  let nodes
  if (scopedSlotFn) { // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        )
      }
      props = extend(extend({}, bindObject), props)
    }
    nodes = scopedSlotFn(props) || fallback // 获得name插槽的内容，虚拟节点列表
  } else {
    nodes = this.$slots[name] || fallback // 获得name插槽的内容，虚拟节点列表
  }

  const target = props && props.slot // slot是当前虚拟节点为具名插槽时的插槽名
  if (target) {
    return this.$createElement('template', { slot: target }, nodes) // 创建template节点，指定插槽名，插槽内容为子节点，相当于具名插槽<templage v-slot:XXX>..</template>的写法
  } else {
    return nodes
  }
}
