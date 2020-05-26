/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
/**
 * 侦听者类，订阅者
 */
export default class Watcher {
  vm: Component; // 当前侦听者所属的Vue实例
  expression: string; // getter的表达式字符串
  cb: Function; // value发生变化时的回调函数
  id: number; // Watcher实例编号
  deep: boolean; // 深度监听
  user: boolean; // 用户自定义watcher标志
  lazy: boolean; // 懒执行调度程序接口
  sync: boolean; // 同步执行调度程序接口标志
  dirty: boolean; // 懒执行调度程序接口时，存在脏数据的标志
  active: boolean; // 活跃标志
  deps: Array<Dep>; // 订阅的旧Dep实例列表
  newDeps: Array<Dep>; // 订阅的新Dep实例列表
  depIds: SimpleSet; // 订阅的旧Dep实例的编号集合
  newDepIds: SimpleSet; // 订阅的新Dep实例的编号集合
  before: ?Function; // 调度程序执行调度接口（run方法）前调用的函数 —— Watcher更新数据前的回调函数
  getter: Function; // 监听对象的值访问器
  value: any; // 鉴定对象的值

  /**
   * 侦听者的构造方法
   * @param {Component} vm Vue实例
   * @param {string | Function} expOrFn 需要监听的表达式，或工厂函数
   * @param {Function} cb
   * @param {Object} options 配置项
   * @param {boolean} isRenderWatcher
   */
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this) // 将当前侦听者添加到vm的侦听者列表中
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * 执行getter，重新收集依赖项
   */
  get () {
    pushTarget(this) // 将当前Watcher实例置为Dep模块的全局变量，执行当前Watcher实例的getter，所有在getter中访问到的做了响应式的值，都会通过其对应的Dep实例的depend方法，记录Watcher实例到Dep实例的依赖
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm) // 调用getter方法
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) { // 深度监听
        traverse(value) // 深度执行value所有属性的getter
      }
      popTarget()
      this.cleanupDeps() // 更新依赖列表
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   * 添加Dep实例到新Dep列表
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 清理旧dep列表，用新dep列表更新就dep列表，清空新dep列表
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds // 把newDepIds赋值给depid
    this.newDepIds = tmp
    this.newDepIds.clear() // 清空depIds
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 订阅者接口
   * 当依赖发生变化时执行
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   * 调度程序接口，value发生变化时，执行回调
   * 会被调度程序调用
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value || // 发生变更
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) || // value是对象
        this.deep // 深度监听
      ) {
        // set new value
        const oldValue = this.value // 更新value
        this.value = value
        if (this.user) { // 用户自定义watcher
          try {
            this.cb.call(this.vm, value, oldValue) // 执行回调
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue) // 执行回调
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   * 更新value，针对懒watcher
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false // 清空脏数据标志
  }

  /**
   * Depend on all deps collected by this watcher.
   * 让正在获取监听值，重新收集依赖项的Watcher实例订阅所有当前Watcher实例所订阅的依赖
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend() // 执行当前Watcher实例的所有依赖的depend方法
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * 将当前Watcher实例从Dep实例的订阅者列表中移除，从Vue实例的watcher列表中移除
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this) // 将当前Watcher实例从Vue实例的watcher列表中移除
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
