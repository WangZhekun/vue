/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * Dep实例是可订阅的主题
 */
export default class Dep {
  static target: ?Watcher; // 正在获取监听值，重新收集依赖项的Watcher实例
  id: number; // 编号
  subs: Array<Watcher>; // 订阅该主题的订阅者列表

  constructor () {
    this.id = uid++
    this.subs = []
  }

  /**
   * 添加订阅者
   * @param {Watcher} sub 订阅者
   */
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  /**
   * 移除订阅者
   * @param {Watcher} sub 订阅者
   */
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  /**
   * 让正在获取监听值，重新收集依赖项的Watcher实例订阅当前Dep实例
   */
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  /**
   * 通知订阅者，主题发生改变
   */
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update() // 调用订阅者接口
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// target和targetStack的作用主要是为了解决多Watcher实例的监听链的问题
Dep.target = null // 正在获取监听值，重新收集依赖项的Watcher实例
const targetStack = [] // 正在获取监听值，重新收集依赖项的Watcher实例栈

/**
 * 将Watcher实例指定为正在获取监听值，重新收集依赖项的Watcher实例
 * @param {Watcher} target Watcher实例，订阅者
 */
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

/**
 * 将正在获取监听值，重新收集依赖项的Watcher实例栈的栈顶弹出
 */
export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
