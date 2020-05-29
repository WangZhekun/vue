/* @flow */

import { isIE, isIE9, isEdge } from 'core/util/env'

import {
  extend,
  isDef,
  isUndef
} from 'shared/util'

import {
  isXlink,
  xlinkNS,
  getXlinkProp,
  isBooleanAttr,
  isEnumeratedAttr,
  isFalsyAttrValue,
  convertEnumeratedValue
} from 'web/util/index'

/**
 * 新增、修改或删除虚拟节点的特性
 * @param {VNodeWithData} oldVnode 旧虚拟节点
 * @param {VNodeWithData} vnode 新虚拟节点
 */
function updateAttrs (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const opts = vnode.componentOptions // 该虚拟节点所指向的组件的相关信息：{ Ctor, propsData, listeners, tag, children }
  if (isDef(opts) && opts.Ctor.options.inheritAttrs === false) { // inheritAttrs表示将虚拟节点的非props的特性绑定作为其指向的组件的根节点的特性
    return
  }
  if (isUndef(oldVnode.data.attrs) && isUndef(vnode.data.attrs)) { // 虚拟节点没有HTML特性
    return
  }
  let key, cur, old
  const elm = vnode.elm
  const oldAttrs = oldVnode.data.attrs || {} // 旧虚拟节点的HTML特性
  let attrs: any = vnode.data.attrs || {} // 新虚拟节点的HTML特性
  // clone observed objects, as the user probably wants to mutate it
  if (isDef(attrs.__ob__)) { // 新虚拟节点的HTML特性是响应式的
    attrs = vnode.data.attrs = extend({}, attrs) // 将其改为普通对象
  }

  for (key in attrs) { // 遍历新虚拟节点的HTML特性
    cur = attrs[key] // 新特性
    old = oldAttrs[key] // 旧特性
    if (old !== cur) {
      setAttr(elm, key, cur) // 给DOM节点设置或删除特性
    }
  }
  // #4391: in IE9, setting type can reset value for input[type=radio]
  // #6666: IE/Edge forces progress value down to 1 before setting a max
  /* istanbul ignore if */
  if ((isIE || isEdge) && attrs.value !== oldAttrs.value) { // IE或Edge，新旧value特性不一致
    setAttr(elm, 'value', attrs.value) // 给DOM节点设置或删除特性
  }
  for (key in oldAttrs) { // 遍历旧虚拟节点的HTML特性
    if (isUndef(attrs[key])) { // 新虚拟节点的HTML特性无该特性
      if (isXlink(key)) { // 特性名是否以xlink:开头
        elm.removeAttributeNS(xlinkNS, getXlinkProp(key)) // 从DOM节点中删除带有xlink命名空间的特性
      } else if (!isEnumeratedAttr(key)) {
        elm.removeAttribute(key) // 从DOM节点中删除该特性
      }
    }
  }
}

/**
 * 给DOM节点设置或删除特性
 * @param {Element} el DOM节点
 * @param {string} key 特性名称
 * @param {any} value 特性值
 */
function setAttr (el: Element, key: string, value: any) {
  if (el.tagName.indexOf('-') > -1) { // DOM节点标签名中包含-
    baseSetAttr(el, key, value) // 设置或删除特性
  } else if (isBooleanAttr(key)) { // 特性是布尔类型的，如disabled等
    // set attribute for blank value
    // e.g. <option disabled>Select one</option>
    if (isFalsyAttrValue(value)) { // 特性值是false值
      el.removeAttribute(key) // 移除特性
    } else {
      // technically allowfullscreen is a boolean attribute for <iframe>,
      // but Flash expects a value of "true" when used on <embed> tag
      value = key === 'allowfullscreen' && el.tagName === 'EMBED'
        ? 'true'
        : key
      el.setAttribute(key, value) // 设置特性
    }
  } else if (isEnumeratedAttr(key)) { // 特性是枚举类的特性
    el.setAttribute(key, convertEnumeratedValue(key, value)) // 设置特性
  } else if (isXlink(key)) { // 特性名称包含xlink:
    if (isFalsyAttrValue(value)) { // 特性值是false值
      el.removeAttributeNS(xlinkNS, getXlinkProp(key)) // 移除特性
    } else {
      el.setAttributeNS(xlinkNS, key, value) // 设置特性
    }
  } else {
    baseSetAttr(el, key, value) // 设置或删除特性
  }
}

/**
 * 设置或删除特性
 * @param {Element} el DOM节点
 * @param {string} key 特性名称
 * @param {any} value 特性值
 */
function baseSetAttr (el, key, value) {
  if (isFalsyAttrValue(value)) { // 是否是false值
    el.removeAttribute(key) // 删除特性
  } else {
    // #7138: IE10 & 11 fires input event when setting placeholder on
    // <textarea>... block the first input event and remove the blocker
    // immediately.
    /* istanbul ignore if */
    if (
      isIE && !isIE9 &&
      el.tagName === 'TEXTAREA' &&
      key === 'placeholder' && value !== '' && !el.__ieph
    ) { // 非IE9的ID，TEXTAREA节点，placeholder特性，对IE做兼容处理，在设置placeholder时不触发input事件
      const blocker = e => {
        e.stopImmediatePropagation() // 阻止冒泡
        el.removeEventListener('input', blocker) // 移除事件
      }
      el.addEventListener('input', blocker) // 添加input事件
      // $flow-disable-line
      el.__ieph = true /* IE placeholder patched */
    }
    el.setAttribute(key, value) // 设置特性
  }
}

export default {
  create: updateAttrs, // 新增、修改或删除虚拟节点的特性
  update: updateAttrs // 新增、修改或删除虚拟节点的特性
}
