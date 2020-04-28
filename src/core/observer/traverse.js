/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set() // Dep实例集合，val的依赖编号集合

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 * 深度遍历val的所有属性，实际执行了val的所有属性的getter方法
 */
export function traverse (val: any) {
  _traverse(val, seenObjects) // 收集val的依赖编号
  seenObjects.clear() // TODO: 该方法为什么没有做任何事，就把val的依赖编号集合清空了
}

/**
 * 递归访问val的getter方法，收集Watcher的依赖
 * @param {any} val
 * @param {*} seen
 */
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) { // 不是数组，不是对象，是冻结的对象，是VNode实例
    return
  }
  if (val.__ob__) { // 已经被监听
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) { // 是数组
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else { // 是对象
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
