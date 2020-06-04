/* @flow */

import { isObject, isDef, hasSymbol } from 'core/util/index'

/**
 * Runtime helper for rendering v-for lists.
 */
/**
 * 列表渲染
 * 用渲染函数渲染val的每个元素
 * @param {any} val 待渲染的值，支持数组、字符串、数字、对象
 * @param {(val: any, keyOrIndex: string | number, index?: number ) => VNode} render 渲染函数
 */
export function renderList (
  val: any,
  render: (
    val: any, // 值
    keyOrIndex: string | number, // 属性名或索引，如果是索引，index就不用传了
    index?: number // 索引
  ) => VNode
): ?Array<VNode> {
  let ret: ?Array<VNode>, i, l, keys, key
  if (Array.isArray(val) || typeof val === 'string') { // 值是数组，或字符串
    ret = new Array(val.length)
    for (i = 0, l = val.length; i < l; i++) { // 遍历之，每个元素执行渲染函数
      ret[i] = render(val[i], i) // 渲染
    }
  } else if (typeof val === 'number') { // 值是数字
    ret = new Array(val)
    for (i = 0; i < val; i++) { // 从0到val，遍历之，并依次渲染
      ret[i] = render(i + 1, i) // 渲染
    }
  } else if (isObject(val)) { // 值是对象
    if (hasSymbol && val[Symbol.iterator]) { // 支持Symbol，且val有迭代器。将对象转为数组
      ret = []
      const iterator: Iterator<any> = val[Symbol.iterator]() // 执行迭代器（Generator 函数）
      let result = iterator.next() // 取值
      while (!result.done) {
        ret.push(render(result.value, ret.length)) // 渲染
        result = iterator.next()
      }
    } else { // 不支持Symbol，或val没有迭代器
      keys = Object.keys(val)
      ret = new Array(keys.length) // 创建结果数组，长度与val的属性的个数相同
      for (i = 0, l = keys.length; i < l; i++) { // 遍历属性
        key = keys[i]
        ret[i] = render(val[key], key, i) // 渲染，属性名作为key，属性在ret中的索引为索引
      }
    }
  }
  if (!isDef(ret)) { // 如果ret未定义，则初始化之，表示val的以上条件都不满足
    ret = []
  }
  (ret: any)._isVList = true // 置虚拟节点列表标志为true
  return ret
}
