/* @flow */

import { cached, extend, toObject } from 'shared/util'

/**
 * 将style特性的值（字符串）转为对象
 */
export const parseStyleText = cached(function (cssText) {
  const res = {}
  const listDelimiter = /;(?![^(]*\))/g
  const propertyDelimiter = /:(.+)/
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      const tmp = item.split(propertyDelimiter)
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim())
    }
  })
  return res
})

// merge static and dynamic style data on the same vnode
function normalizeStyleData (data: VNodeData): ?Object {
  const style = normalizeStyleBinding(data.style)
  // static style is pre-processed into an object during compilation
  // and is always a fresh object, so it's safe to merge into it
  return data.staticStyle
    ? extend(data.staticStyle, style)
    : style
}

// normalize possible array / string values into Object
/**
 * 将动态样式标准化成对象
 * @param {any} bindingStyle 动态样式
 */
export function normalizeStyleBinding (bindingStyle: any): ?Object {
  if (Array.isArray(bindingStyle)) {
    return toObject(bindingStyle)
  }
  if (typeof bindingStyle === 'string') {
    return parseStyleText(bindingStyle)
  }
  return bindingStyle
}

/**
 * parent component style should be after child's
 * so that parent component's style could override it
 */
/**
 * 获取虚拟节点的样式对象
 * 会向上检查父组件，根据checkChild向下检查子组件
 * @param {VNodeWithData} vnode 虚拟节点
 * @param {boolean} checkChild 检查子组件标志
 */
export function getStyle (vnode: VNodeWithData, checkChild: boolean): Object {
  const res = {}
  let styleData

  if (checkChild) {
    let childNode = vnode
    while (childNode.componentInstance) { // childNode是组件的占位节点
      childNode = childNode.componentInstance._vnode // 取子组件的根虚拟节点
      if (
        childNode && childNode.data &&
        (styleData = normalizeStyleData(childNode.data)) // 标准化子组件根虚拟节点的样式
      ) {
        extend(res, styleData) // 合并样式
      }
    }
  }

  if ((styleData = normalizeStyleData(vnode.data))) { // 标准化虚拟节点的样式
    extend(res, styleData) // 合并样式
  }

  let parentNode = vnode
  while ((parentNode = parentNode.parent)) { // vnode作为所属组件的根节点，并向上查找占位节点作为根节点的情况
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) { // 标准化父组件根虚拟节点的样式
      extend(res, styleData) // 合并样式
    }
  }
  return res
}
