/* @flow */

import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

/**
 * 给目标对象添加渲染相关的方法
 * @param {any} target 目标对象
 */
export function installRenderHelpers (target: any) {
  target._o = markOnce // 设置一次性（v-once）虚拟节点设置相关静态属性
  target._n = toNumber // 将字符串转化为数字
  target._s = toString // Object原型对象的toString
  target._l = renderList // 列表渲染
  target._t = renderSlot // 插槽渲染
  target._q = looseEqual // 判断两个值是否宽松相等，即数组和对象，只要元素和属性值宽松相等，即相等
  target._i = looseIndexOf // 获取指定数组中与指定值宽松相等的元素的索引
  target._m = renderStatic // 执行静态render函数，创建静态虚拟节点
  target._f = resolveFilter // 获取指定id的过滤器
  target._k = checkKeyCodes // 检查键盘事件的键名和键值是否符合预期
  target._b = bindObjectProps // 将v-bind绑定的属性添加到虚拟节点的数据对象的相应位置
  target._v = createTextVNode // 创建文本虚拟节点
  target._e = createEmptyVNode // 创建注释节点
  target._u = resolveScopedSlots // 处理插槽列表，返回插槽名到可以返回插槽内容的虚拟节点的函数的映射对象
  target._g = bindObjectListeners // 将v-on绑定的事件对象合并到虚拟节点的数据对象中
  target._d = bindDynamicKeys // 将待合并的属性列表中的属性合并到目标对象中
  target._p = prependModifier // 在事件名前添加事件修饰符对应的表示符号，比如.capture的表示符号为!
}
