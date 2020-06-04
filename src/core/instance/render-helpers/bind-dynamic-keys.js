/* @flow */

// helper to process dynamic keys for dynamic arguments in v-bind and v-on.
// For example, the following template:
//
// <div id="app" :[key]="value">
//
// compiles to the following:
//
// _c('div', { attrs: bindDynamicKeys({ "id": "app" }, [key, value]) })

import { warn } from 'core/util/debug'

/**
 * 将待合并的属性列表中的属性合并到目标对象中
 * @param {Object} baseObj 目标对象
 * @param {Array<any>} values 待合并属性列表，格式：[key1, value1, key2, value2, key3, value3, ...]
 */
export function bindDynamicKeys (baseObj: Object, values: Array<any>): Object {
  for (let i = 0; i < values.length; i += 2) { // 遍历待合并属性列表，步进值为2
    const key = values[i] // 取属性名
    if (typeof key === 'string' && key) { // 属性名为字符串，且存在
      baseObj[values[i]] = values[i + 1] // 将该属性和值添加到目标对象中
    } else if (process.env.NODE_ENV !== 'production' && key !== '' && key !== null) {
      // null is a special value for explicitly removing a binding
      warn(
        `Invalid value for dynamic directive argument (expected string or null): ${key}`,
        this
      )
    }
  }
  return baseObj
}

// helper to dynamically append modifier runtime markers to event names.
// ensure only append when value is already string, otherwise it will be cast
// to string and cause the type check to miss.
/**
 * 在事件名前添加事件修饰符对应的表示符号，比如.capture的表示符号为!
 * @param {any} value 事件名
 * @param {string} symbol 事件修饰符对应的表示符号
 */
export function prependModifier (value: any, symbol: string): any {
  return typeof value === 'string' ? symbol + value : value
}
