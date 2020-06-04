/* @flow */

import config from 'core/config'
import { hyphenate } from 'shared/util'

function isKeyNotMatch<T> (expect: T | Array<T>, actual: T): boolean {
  if (Array.isArray(expect)) {
    return expect.indexOf(actual) === -1
  } else {
    return expect !== actual
  }
}

/**
 * Runtime helper for checking keyCodes from config.
 * exposed as Vue.prototype._k
 * passing in eventKeyName as last argument separately for backwards compat
 */
/**
 * 检查键盘事件的键名和键值是否符合预期
 * @param {number} eventKeyCode 键盘事件的键的编号
 * @param {string} key 键名
 * @param {number | Array<number>} builtInKeyCode 期望的键的编号，在config.keyCodes中不包含指定键的编号时，该参数生效
 * @param {string} eventKeyName 键盘事件的键的名称
 * @param {string | Array<string>} builtInKeyName 期望的键的名称
 */
export function checkKeyCodes (
  eventKeyCode: number,
  key: string,
  builtInKeyCode?: number | Array<number>,
  eventKeyName?: string,
  builtInKeyName?: string | Array<string>
): ?boolean {
  const mappedKeyCode = config.keyCodes[key] || builtInKeyCode // 期望的键的编号
  if (builtInKeyName && eventKeyName && !config.keyCodes[key]) {
    return isKeyNotMatch(builtInKeyName, eventKeyName)
  } else if (mappedKeyCode) {
    return isKeyNotMatch(mappedKeyCode, eventKeyCode)
  } else if (eventKeyName) {
    return hyphenate(eventKeyName) !== key
  }
}
