/* @flow */

/**
 * 处理插槽列表，返回插槽名到可以返回插槽内容的虚拟节点的函数的映射对象
 * 返回值的结构：{ [key: string]: Function, $stable: boolean, $key: string }
 * $stable表示是否没有动态key
 * $key为插槽列表的hash值
 * @param {ScopedSlotsData} fns 插槽列表，格式[{key:插槽名, fn:function(插槽名){return 节点生成结果},proxy:true},...]
 * @param {Object} res 结果对象，插槽名到可以返回插槽内容的虚拟节点的函数的映射
 * @param {boolean} hasDynamicKeys 有动态key标志，当需要强制更新（强制更新：el有v-for，或插槽节点有v-if、v-for、动态插槽名，包含为插槽的子节点）
 * @param {number} contentHashKey 插槽列表的哈希值，当不需要强制更新（强制更新：el有v-for，或插槽节点有v-if、v-for、动态插槽名，包含为插槽的子节点），且需要key（el有v-if）是该参数存在
 */
export function resolveScopedSlots (
  fns: ScopedSlotsData, // see flow/vnode
  res?: Object,
  // the following are added in 2.6
  hasDynamicKeys?: boolean,
  contentHashKey?: number
): { [key: string]: Function, $stable: boolean } {
  res = res || { $stable: !hasDynamicKeys } // $stable表示没有动态key
  for (let i = 0; i < fns.length; i++) { // 遍历插槽列表
    const slot = fns[i] // 取插槽对象
    if (Array.isArray(slot)) { // 插槽是数组
      resolveScopedSlots(slot, res, hasDynamicKeys) // 递归调用
    } else if (slot) { // 插槽对象存在
      // marker for reverse proxying v-slot without scope on this.$slots
      if (slot.proxy) { // 代理
        slot.fn.proxy = true
      }
      res[slot.key] = slot.fn
    }
  }
  if (contentHashKey) {
    (res: any).$key = contentHashKey // $key为插槽列表的hash值
  }
  return res
}
