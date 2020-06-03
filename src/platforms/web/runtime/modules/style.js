/* @flow */

import { getStyle, normalizeStyleBinding } from 'web/util/style'
import { cached, camelize, extend, isDef, isUndef, hyphenate } from 'shared/util'

const cssVarRE = /^--/
const importantRE = /\s*!important$/
/**
 * 给DOM节点设置样式
 * @param {Element} el 设置样式的DOM节点
 * @param {string} name 样式名称
 * @param {any} val 样式值
 */
const setProp = (el, name, val) => {
  /* istanbul ignore if */
  if (cssVarRE.test(name)) { // 以--开头的样式
    el.style.setProperty(name, val)
  } else if (importantRE.test(val)) { // 有!important的样式值
    el.style.setProperty(hyphenate(name), val.replace(importantRE, ''), 'important') // 转换样式名称后，设置样式值
  } else {
    const normalizedName = normalize(name) // 标准化样式名称
    if (Array.isArray(val)) { // 样式值是数组
      // Support values array created by autoprefixer, e.g.
      // {display: ["-webkit-box", "-ms-flexbox", "flex"]}
      // Set them one by one, and the browser will only set those it can recognize
      for (let i = 0, len = val.length; i < len; i++) {
        el.style[normalizedName] = val[i]
      }
    } else {
      el.style[normalizedName] = val
    }
  }
}

const vendorNames = ['Webkit', 'Moz', 'ms']

let emptyStyle
/**
 * 标准化prop
 */
const normalize = cached(function (prop) {
  emptyStyle = emptyStyle || document.createElement('div').style // DOM样式对象
  prop = camelize(prop) // 属性名改驼峰格式
  if (prop !== 'filter' && (prop in emptyStyle)) { // prop不是filter且不是默认样式对象的属性
    return prop
  }
  const capName = prop.charAt(0).toUpperCase() + prop.slice(1) // 将驼峰格式的名称首字母大写
  for (let i = 0; i < vendorNames.length; i++) {
    const name = vendorNames[i] + capName
    if (name in emptyStyle) { // prop带有Webkit、Moz或ms前缀是有效样式
      return name // 返回带有前缀的名称
    }
  }
})

/**
 * 创建、更新样式
 * @param {VNodeWithData} oldVnode 旧虚拟节点
 * @param {VNodeWithData} vnode 新虚拟节点
 */
function updateStyle (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const data = vnode.data // 新虚拟节点的数据对象
  const oldData = oldVnode.data // 旧虚拟节点的数据对象

  if (isUndef(data.staticStyle) && isUndef(data.style) &&
    isUndef(oldData.staticStyle) && isUndef(oldData.style)
  ) { // 无静态样式和动态样式
    return
  }

  let cur, name
  const el: any = vnode.elm // 新虚拟节点的渲染结果
  const oldStaticStyle: any = oldData.staticStyle // 旧虚拟节点的静态样式
  const oldStyleBinding: any = oldData.normalizedStyle || oldData.style || {} // 旧虚拟节点的动态样式

  // if static style exists, stylebinding already merged into it when doing normalizeStyleData
  const oldStyle = oldStaticStyle || oldStyleBinding // 如果静态样式存在，则做样式标准化时，会把动态样式合并到静态样式中

  const style = normalizeStyleBinding(vnode.data.style) || {} // 将新虚拟节点的样式标准化成对象

  // store normalized style under a different key for next diff
  // make sure to clone it if it's reactive, since the user likely wants
  // to mutate it.
  vnode.data.normalizedStyle = isDef(style.__ob__) // 如果样式对象是响应式的，转化为普通对象
    ? extend({}, style)
    : style

  const newStyle = getStyle(vnode, true) // 获取虚拟节点的样式对象

  for (name in oldStyle) { // 删除在旧样式中存在，在新样式中不存在的数据
    if (isUndef(newStyle[name])) {
      setProp(el, name, '') // 给DOM节点设置样式
    }
  }
  for (name in newStyle) { // 更新样式
    cur = newStyle[name]
    if (cur !== oldStyle[name]) {
      // ie9 setting to null has no effect, must use empty string
      setProp(el, name, cur == null ? '' : cur) // 给DOM节点设置样式
    }
  }
}

export default {
  create: updateStyle,
  update: updateStyle
}
