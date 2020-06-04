/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto) // 以Array.prototype为原型创建对象

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method] // Array的原始操作方法
  def(arrayMethods, method, function mutator (...args) { // 给以Array.prototype为原型创建对象，定义数组操作方法
    const result = original.apply(this, args) // 执行Array的原始操作方法
    const ob = this.__ob__ // Observer实例
    let inserted // 待插入数组的元素
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted) // 监听该数组的所有元素
    // notify change
    ob.dep.notify() // 通知变更
    return result
  })
})
