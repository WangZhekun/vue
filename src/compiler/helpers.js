/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

type Range = { start?: number, end?: number };

/* eslint-disable no-unused-vars */
/**
 * 控制台打印错误
 * @param {string} msg 错误信息
 */
export function baseWarn (msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`)
}
/* eslint-enable no-unused-vars */

/**
 * 获取modules中属性名为key的属性值，过滤掉空值
 * @param {Array<Object>} modules 模块数组
 * @param {string} key 属性名
 */
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

/**
 * 添加属性
 * @param {ASTElement} el 节点
 * @param {string} name 属性名
 * @param {string} value 编译后的字符串
 * @param {Range} range 范围
 * @param {boolean} dynamic 动态标志
 */
export function addProp (el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range)) // 添加属性，属性由对象组成，{name: 属性名称，value: 属性值, dynamic:, start: 范围起始, end: 范围结束 }
  el.plain = false // TODO: 这个属性是什么意思
}

export function addAttr (el: ASTElement, name: string, value: any, range?: Range, dynamic?: boolean) {
  const attrs = dynamic
    ? (el.dynamicAttrs || (el.dynamicAttrs = []))
    : (el.attrs || (el.attrs = []))
  attrs.push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr (el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value
  el.attrsList.push(rangeSetItem({ name, value }, range))
}

export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  isDynamicArg: boolean,
  modifiers: ?ASTModifiers,
  range?: Range
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({
    name,
    rawName,
    value,
    arg,
    isDynamicArg,
    modifiers
  }, range))
  el.plain = false
}

/**
 * 在事件名前添加指令修饰符的标识符
 * @param {string} symbol 指令修饰符的标识符
 * @param {string} name 事件名
 * @param {boolean} dynamic name是动态的
 */
function prependModifierMarker (symbol: string, name: string, dynamic?: boolean): string {
  return dynamic
    ? `_p(${name},"${symbol}")` // _p表示在name之前添加symbol
    : symbol + name // mark the event as captured
}

/**
 * 添加节点的事件监听
 * @param {ASTElement} el 节点
 * @param {string} name 事件名
 * @param {string} value 编译后的字符串
 * @param {ASTModifiers} modifiers 指令修饰符
 * @param {boolean} important 重要标志，如果为true，会把value放在首位
 * @param {Function} warn
 * @param {Range} range 范围
 * @param {boolean} dynamic name是动态的
 */
export function addHandler (
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean
) {
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    )
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  if (modifiers.right) { // 只当点击鼠标右键时触发
    if (dynamic) {
      name = `(${name})==='click'?'contextmenu':(${name})`
    } else if (name === 'click') { // click事件
      name = 'contextmenu'
      delete modifiers.right
    }
  } else if (modifiers.middle) { // 只当点击鼠标中键时触发
    if (dynamic) {
      name = `(${name})==='click'?'mouseup':(${name})`
    } else if (name === 'click') { // click事件
      name = 'mouseup'
    }
  }

  // check capture modifier
  if (modifiers.capture) { // 添加事件侦听器时使用 capture 模式
    delete modifiers.capture
    name = prependModifierMarker('!', name, dynamic) // 在事件名前添加指令修饰符的标识符
  }
  if (modifiers.once) { // 只触发一次回调
    delete modifiers.once
    name = prependModifierMarker('~', name, dynamic) // 在事件名前添加指令修饰符的标识符
  }
  /* istanbul ignore if */
  if (modifiers.passive) { // 以 { passive: true } 模式添加侦听器
    delete modifiers.passive
    name = prependModifierMarker('&', name, dynamic) // 在事件名前添加指令修饰符的标识符
  }

  let events
  if (modifiers.native) { // 监听组件根元素的原生事件
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    events = el.events || (el.events = {})
  }

  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range) // 给{ value: value.trim(), dynamic }设置范围，组装事件处理方法的表示对象
  if (modifiers !== emptyObject) { // 指令的修饰符非空
    newHandler.modifiers = modifiers
  }

  const handlers = events[name] // 获取事件处理方法的表示对象
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    events[name] = newHandler
  }

  el.plain = false // 简单节点标志
}

export function getRawBindingAttr (
  el: ASTElement,
  name: string
) {
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}

/**
 * 获取el的name属性的值
 * @param {ASTElement} el AST节点，类型定义在flow/compiler.js中
 * @param {string} name 属性名
 * @param {boolean} getStatic 是否获取静态属性
 */
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name) // 获取el的绑定属性的值，并将其从属性列表中移除
  if (dynamicValue != null) { // name属性为被绑定的动态属性
    return parseFilters(dynamicValue) // 处理表达式中的过滤器
  } else if (getStatic !== false) { // name属性为静态属性
    const staticValue = getAndRemoveAttr(el, name) // 获取el的name属性的值，并将其移除属性列表
    if (staticValue != null) {
      return JSON.stringify(staticValue)
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
/**
 * 获取el的name特性的值，并将其移除特性列表
 * @param {ASTElement} el AST节点，类型定义在flow/compiler.js中
 * @param {string} name 属性名
 * @param {boolean} removeFromMap
 */
export function getAndRemoveAttr (
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  return val
}

export function getAndRemoveAttrByRegex (
  el: ASTElement,
  name: RegExp
) {
  const list = el.attrsList
  for (let i = 0, l = list.length; i < l; i++) {
    const attr = list[i]
    if (name.test(attr.name)) {
      list.splice(i, 1)
      return attr
    }
  }
}

/**
 * 给item设置范围属性
 * @param {any} item
 * @param {{ start?: number, end?: number }} range
 */
function rangeSetItem (
  item: any,
  range?: { start?: number, end?: number }
) {
  if (range) {
    if (range.start != null) {
      item.start = range.start
    }
    if (range.end != null) {
      item.end = range.end
    }
  }
  return item
}
