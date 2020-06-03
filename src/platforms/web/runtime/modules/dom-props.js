/* @flow */

import { isDef, isUndef, extend, toNumber } from 'shared/util'
import { isSVG } from 'web/util/index'

let svgContainer

/**
 * 更新虚拟节点的DOM属性
 * @param {VNodeWithData} oldVnode 旧虚拟节点
 * @param {VNodeWithData} vnode 新虚拟节点
 */
function updateDOMProps (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (isUndef(oldVnode.data.domProps) && isUndef(vnode.data.domProps)) {
    return
  }
  let key, cur
  const elm: any = vnode.elm // 新虚拟节点的渲染结果
  const oldProps = oldVnode.data.domProps || {} // 旧虚拟节点的DOM属性对象
  let props = vnode.data.domProps || {} // 新虚拟节点的DOM属性对象
  // clone observed objects, as the user probably wants to mutate it
  if (isDef(props.__ob__)) { // 属性对象是响应式的，将其转化为非响应式的
    props = vnode.data.domProps = extend({}, props)
  }

  for (key in oldProps) { // 将不在新虚拟节点的DOM属性对象中的属性删除
    if (!(key in props)) {
      elm[key] = ''
    }
  }

  for (key in props) { // 遍历并更新新虚拟节点的DOM属性对象
    cur = props[key] // 取属性值
    // ignore children if the node has textContent or innerHTML,
    // as these will throw away existing DOM nodes and cause removal errors
    // on subsequent patches (#3360)
    if (key === 'textContent' || key === 'innerHTML') { // 属性是textContent或innerHTML
      if (vnode.children) vnode.children.length = 0 // 清空新虚拟节点的子节点
      if (cur === oldProps[key]) continue // 该属性无变化
      // #6601 work around Chrome version <= 55 bug where single textNode
      // replaced by innerHTML/textContent retains its parentNode property
      if (elm.childNodes.length === 1) { // 有一个子节点时，移除子节点
        elm.removeChild(elm.childNodes[0])
      }
    }

    if (key === 'value' && elm.tagName !== 'PROGRESS') { // 属性是value，且DOM节点不是PROGRESS
      // store value as _value as well since
      // non-string values will be stringified
      elm._value = cur // 备份value属性的值
      // avoid resetting cursor position when value is the same
      const strCur = isUndef(cur) ? '' : String(cur) // 将value属性的值转换为字符串
      if (shouldUpdateValue(elm, strCur)) { // 检查elm是否需要更新value属性
        elm.value = strCur // 更新value属性
      }
    } else if (key === 'innerHTML' && isSVG(elm.tagName) && isUndef(elm.innerHTML)) { // innerHTML属性存在，标签是SVG
      // IE doesn't support innerHTML for SVG elements
      svgContainer = svgContainer || document.createElement('div') // 初始化SVG容器节点
      svgContainer.innerHTML = `<svg>${cur}</svg>` // 添加svg内容
      const svg = svgContainer.firstChild
      while (elm.firstChild) { // 清空DOM节点的子节点
        elm.removeChild(elm.firstChild)
      }
      while (svg.firstChild) { // 将svg内容逐个添加到DOM节点中
        elm.appendChild(svg.firstChild)
      }
    } else if (
      // skip the update if old and new VDOM state is the same.
      // `value` is handled separately because the DOM value may be temporarily
      // out of sync with VDOM state due to focus, composition and modifiers.
      // This  #4521 by skipping the unnecessary `checked` update.
      cur !== oldProps[key] // 属性值有更新
    ) {
      // some property updates can throw
      // e.g. `value` on <progress> w/ non-finite value
      try {
        elm[key] = cur // 更新属性值
      } catch (e) {}
    }
  }
}

// check platforms/web/util/attrs.js acceptValue
type acceptValueElm = HTMLInputElement | HTMLSelectElement | HTMLOptionElement;

/**
 * 检查elm是否需要更新value属性
 * @param {acceptValueElm} elm DOM节点
 * @param {string} checkVal value属性的值
 */
function shouldUpdateValue (elm: acceptValueElm, checkVal: string): boolean {
  return (!elm.composing && ( // DOM节点的复合事件不在进行中
    elm.tagName === 'OPTION' || // DOM节点为option TODO：为何节点名为option就需要更新
    isNotInFocusAndDirty(elm, checkVal) || // 检查elm是否没有获取焦点，且有脏数据
    isDirtyWithModifiers(elm, checkVal) // 检查elm的value属性值是否有更新
  ))
}

/**
 * 检查elm是否没有获取焦点，且有脏数据
 * @param {acceptValueElm} elm DOM节点
 * @param {string} checkVal value属性的值
 */
function isNotInFocusAndDirty (elm: acceptValueElm, checkVal: string): boolean {
  // return true when textbox (.number and .trim) loses focus and its value is
  // not equal to the updated value
  let notInFocus = true
  // #6157
  // work around IE bug when accessing document.activeElement in an iframe
  try { notInFocus = document.activeElement !== elm } catch (e) {}
  return notInFocus && elm.value !== checkVal
}

/**
 * 检查elm的value属性值是否有更新
 * @param {acceptValueElm} elm DOM节点
 * @param {string} newVal value属性的值
 */
function isDirtyWithModifiers (elm: any, newVal: string): boolean {
  const value = elm.value // 取旧的value属性的值
  const modifiers = elm._vModifiers // v-model指令的修饰符对象。injected by v-model runtime
  if (isDef(modifiers)) { // 修饰符对象
    if (modifiers.number) {
      return toNumber(value) !== toNumber(newVal)
    }
    if (modifiers.trim) {
      return value.trim() !== newVal.trim()
    }
  }
  return value !== newVal
}

export default {
  create: updateDOMProps,
  update: updateDOMProps
}
