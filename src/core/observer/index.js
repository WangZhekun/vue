/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array' // arrayMethods为数组的原型对象
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods) // 数组原型的各属性

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true // 是否可监听，即是否需要创建Observer实例给对象和数组

/**
 * 修改全局的是否可监听配置
 * @param {boolean} value 是否可监听，即是否需要创建Observer实例给对象和数组
 */
export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 * Observer类，附加于每个需要监听的对象上。observer会将目标对象的属性转化成getter/setter，以收集依赖和发布更新。
 */
/**
 * 监听器类，用来监听对象/数组的变化
 */
export class Observer {
  value: any; // 目标对象
  dep: Dep; // 依赖
  vmCount: number; // 当前监听器对象作为Vue实例的根数据对象的数量 number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this) // 给目标对象添加__ob__属性
    if (Array.isArray(value)) {
      if (hasProto) { // 对象有__pro__属性
        protoAugment(value, arrayMethods) // 扩展value的原型链
      } else {
        copyAugment(value, arrayMethods, arrayKeys) // 给value定义隐藏属性
      }
      this.observeArray(value) // 监听数组的每个元素
    } else {
      this.walk(value) // 把value定义成响应式的
    }
  }

  /**
   * 把obj的每一个属性都定义成响应式的
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   * @param {Object} obj 目标对象
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]) // 给obj定义一个响应式的属性key
    }
  }

  /**
   * Observe a list of Array items.
   * 给每个数组元素添加__ob__（如果数组元素不存在__ob__）
   * @param {Array<any>} items 目标数组
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]) // 给每个数组元素添加__ob__
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 * 通过截取原型链，扩展目标对象或数组
 * @param {Array<any> | Object} target 目标数组
 * @param {Object} src 原型对象
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
/**
 * 通过定义隐藏的属性，来扩展目标对象
 * @param {Object} target 目标对象
 * @param {Object} src 属性值的集合
 * @param {Array<string>} keys 属性名列表
 */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key]) // 给target定义不可枚举的key属性，属性值为src[key]
  }
}

/**
 * 如果value没有__ob__，则创建Observer实例
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 * @param {any} value 待监听值
 * @param {boolean} asRootData
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) { // 非对象，是VNode的实例
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) { // 包含__ob__属性
    ob = value.__ob__
  } else if (
    shouldObserve && // 可监听
    !isServerRendering() && // 非服务端渲染
    (Array.isArray(value) || isPlainObject(value)) && // value是数组或对象
    Object.isExtensible(value) && // 可扩展
    !value._isVue // 不是Vue实例
  ) {
    ob = new Observer(value) // 创建监听者实例，在构造方法内，关联value和ob
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * 给obj定义一个响应式的属性key
 * Define a reactive property on an Object.
 * @param {Object} obj 目标对象
 * @param {string} key 属性名
 * @param {any} val 值
 * @param {Function} customSetter
 * @param {boolean} shallow 浅响应式标志，即val为对象或数组时，不深入地对val添加Observer实例
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // 创建Dep实例，key属性所属的Dep实例

  const property = Object.getOwnPropertyDescriptor(obj, key) // 获取属性key的描述对象
  if (property && property.configurable === false) { // 属性key不可配置
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get // 属性key的getter方法
  const setter = property && property.set // 属性key的setter方法
  if ((!getter || setter) && arguments.length === 2) { // 如果不存在getter方法，或存在stter方法，且只有两个参数
    val = obj[key]
  }

  let childOb = !shallow && observe(val) // 给val添加Observer实例
  Object.defineProperty(obj, key, { // 给obj添加key属性
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val // 或调用原getter，或返回val
      if (Dep.target) { // key属性有相应的Watcher实例，即在Watcher实例的getter方法中会设置Dep.target
        dep.depend() // 让key属性对应的Watcher实例，订阅dep
        if (childOb) { // key属性的值，存在__ob__
          childOb.dep.depend() // 让key属性对应的Watcher实例，订阅key属性的值的__ob__中的Dep实例，即key属性本身发生变化，或key属性的值发生变化，都会触发Key属性相应Watcher实例的更新
          if (Array.isArray(value)) {
            dependArray(value) // 收集数组的value的每个元素的依赖，让value的每个元素的__ob__的Dep实例都被key对应的Watcher订阅
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val // 取旧值
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) { // 如果新值与旧值相等，或都为NaN，则不作处理
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return // key原本只读，则不作处理
      if (setter) {
        setter.call(obj, newVal) // 执行原setter访问器
      } else {
        val = newVal // 赋值
      }
      childOb = !shallow && observe(newVal) // 给新值添加Observer实例，深度地
      dep.notify() // 通知key属性对应Dep实例的订阅者更新
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
/**
 * 给指定（响应式）对象/数组添加属性（，属性值也是响应式的）
 * @param {Array<any> | Object} target 目标对象/数组
 * @param {any} key 属性名
 * @param {any} val 属性值
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) { // target为数组，且key为合法数组索引
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) { // key已经是target的属性，但不是Object的原型的属性
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__ // 监听器对象
  if (target._isVue || (ob && ob.vmCount)) { // target是Vue实例，或target是Vue实例的根数据对象，即根数据对象不允许添加新属性 TODO: 为什么
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) { // 监听器对象不存在
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val) // 给target定义一个响应式的属性key TODO：这里为什么不用target
  ob.dep.notify() // 通知更新
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
/**
 * 删除指定对象/数组的自有属性/索引
 * @param {Array<any> | Object} target 目标对象/数组
 * @param {any} key 待删除的属性名
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) { // target是数组，且key是合法的数组索引
    target.splice(key, 1) // 删除
    return
  }
  const ob = (target: any).__ob__ // 监听器实例
  if (target._isVue || (ob && ob.vmCount)) { // target是Vue实例，或target是Vue实例的根数据对象，即根数据对象不允许添加新属性
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) { // key不是target的自有属性
    return
  }
  delete target[key] // 删除
  if (!ob) {
    return
  }
  ob.dep.notify() // 通知更新
}

/**
 * 当数组value被访问时，收集数组的每个元素的依赖。
 * 因为我们无法像getter属性那样拦截数组元素的访问
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * @param {Array<any>} value 目标数组
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i] // 取数组元素
    e && e.__ob__ && e.__ob__.dep.depend() // 让正在获取监听值，重新收集依赖项的Watcher实例，订阅数组元素的__ob__的Dep实例
    if (Array.isArray(e)) { // 如果数组元素也是数组，则递归调用dependArray
      dependArray(e)
    }
  }
}
