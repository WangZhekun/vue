/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

/**
 * 给target创建key属性，该属性是target[sourceKey]的代理
 * @param {Object} target 创建代理的目标对象
 * @param {string} sourceKey 源对象在target中的属性名
 * @param {string} key 代理属性
 */
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/**
 * 初始化数据状态：props、methods、data、watch、computed
 * @param {Component} vm Vue实例
 */
export function initState (vm: Component) {
  vm._watchers = [] // 初始化Watcher实例列表
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props) // 初始化属性
  if (opts.methods) initMethods(vm, opts.methods) // 初始化方法
  if (opts.data) { // 数据对象
    initData(vm) // 初始化Vue实例的响应式数据对象
  } else {
    observe(vm._data = {}, true /* asRootData */) // 创建根响应式数据对象（空对象）
  }
  if (opts.computed) initComputed(vm, opts.computed) // 初始化计算属性
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch) // 初始化watch
  }
}

/**
 * 初始化组件属性
 * @param {Component} vm Vue实例
 * @param {Object} propsOptions 组件属性配置对象
 */
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {} // 属性对象
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key) // 给Vue实例创建属性key，key是vm._props中对应属性的代理
    }
  }
  toggleObserving(true)
}

/**
 * 初始化响应式数据
 * @param {Component} vm Vue实例
 */
function initData (vm: Component) {
  let data = vm.$options.data // 取数据的配置对象
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {} // 响应式数据对象
  if (!isPlainObject(data)) { // 数据对象不是纯对象
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) { // 遍历响应式数据对象的属性
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) { // 响应式数据对象的属性不能与组件属性重名
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) { // key不是以_或$开始的字符串
      proxy(vm, `_data`, key) // 给Vue实例创建属性key，key是vm._data中对应属性的代理
    }
  }
  // observe data
  observe(data, true /* asRootData */)
}

/**
 * 获取响应式数据工厂函数返回的结果
 * @param {Function} data 响应式数据对象的工厂函数
 * @param {Component} vm Vue实例
 */
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget() // 不收集依赖
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true } // 计算属性的Watcher实例配置，懒模式，即依赖的数据发生变化后不立即更新

/**
 * 初始化计算属性
 * @param {Component} vm Vue实例
 * @param {Object} computed 计算属性配置对象
 */
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null) // 计算属性到各自Watcher实例的映射
  // computed properties are just getters during SSR
  const isSSR = isServerRendering() // 是否是服务端渲染

  for (const key in computed) { // 遍历计算属性
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get // 获取get访问器
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) { // 非服务端渲染
      // create internal watcher for the computed property.
      watchers[key] = new Watcher( // 创建Watcher实例，一个计算属性的get对应一个Watcher实例
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef) // 给Vue实例定义计算属性key
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

/**
 * 给target定义计算属性key
 * @param {any} target 目标对象
 * @param {string} key 计算属性的属性名
 * @param {Object | Function} userDef 自定义的计算属性的属性值，或getter、setter访问器
 */
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering() // 非服务端渲染，需要缓存
  if (typeof userDef === 'function') { // 自定义的计算属性属性值为函数
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key) // 创建Vue实例的计算属性的get方法
      : createGetterInvoker(userDef) // 创建Vue实例的计算属性的执行userDef的get方法
    sharedPropertyDefinition.set = noop
  } else { // 自定义的计算属性属性值为对象
    sharedPropertyDefinition.get = userDef.get // 存在get方法
      ? shouldCache && userDef.cache !== false // 可以缓存
        ? createComputedGetter(key) // 创建Vue实例的计算属性的get方法
        : createGetterInvoker(userDef.get) // 创建Vue实例的计算属性的执行userDef.get的get方法
      : noop
    sharedPropertyDefinition.set = userDef.set || noop // 存在set方法
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/**
 * 创建Vue实例的计算属性的get方法
 * @param {string} key 计算属性的属性名
 */
function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key] // this指Vue实例，取计算属性对应的Watcher实例
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate() // 更新value，针对懒watcher
      }
      if (Dep.target) {
        watcher.depend() // 更新watcher的依赖
      }
      return watcher.value
    }
  }
}

/**
 * 创建Vue实例的计算属性的执行fn的get方法
 * @param {Function}} fn 计算属性的get方法
 */
function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this) // 执行get方法，this指Vue实例
  }
}

/**
 * 初始化方法
 * 做了方法的this绑定
 * @param {Component} vm Vue实例
 * @param {Object} methods Vue实例的方法配置对象
 */
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm) // 绑定方法的this，并将方法放到Vue实例中
  }
}

/**
 * 初始化watch
 * @param {Component} vm Vue实例
 * @param {Object} watch 监听配置对象
 */
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) { // 遍历watch配置
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]) // 创建watcher
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

/**
 * 创建Watcher实例
 * @param {Component} vm Vue实例
 * @param {string | Function} expOrFn 需要监听的表达式，或工厂函数
 * @param {any} handler 监听的回调函数，可以是函数，可以是包含handler的配置对象，可以是Vue实例的方法名（字符串）
 * @param {Object} options Watcher配置项
 */
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) { // 监听的回调函数为纯对象
    options = handler // 将其作为配置对象
    handler = handler.handler // 取配置对象中的实际回调函数
  }
  if (typeof handler === 'string') { // 监听的回调函数为字符串
    handler = vm[handler] // 取handler指定的Vue实例方法
  }
  return vm.$watch(expOrFn, handler, options) // 创建Watcher实例
}

/**
 * 定义Vue原型的$data、$props、$set、$delete、$watch API
 * @param {Class<Component>} Vue Vue类
 */
export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef) // 定义Vue实例的_data属性访问器，只读
  Object.defineProperty(Vue.prototype, '$props', propsDef) // 定义Vue实例的_props属性访问器，只读

  Vue.prototype.$set = set // 给指定响应式对象/数组添加属性/索引
  Vue.prototype.$delete = del // 删除指定对象/数组的自由属性/索引

  /**
   * 定义$watch原型方法，该方法用来创建Watcher实例
   * @param {string | Function} expOrFn 需要监听的表达式，或工厂函数
   * @param {any} cb 监听的回调函数
   * @param {Object} options Watcher配置项
   */
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) { // 监听的回调函数为纯对象
      return createWatcher(vm, expOrFn, cb, options) // 创建Watcher实例
    }
    options = options || {}
    options.user = true // 用户自定义Watcher标志
    const watcher = new Watcher(vm, expOrFn, cb, options) // 创建Watcher实例
    if (options.immediate) { // 立即执行标志
      try {
        cb.call(vm, watcher.value) // 执行监听的回调函数
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn () { // 返回可以将Watcher实例从Vue实例中移除的方法
      watcher.teardown()
    }
  }
}
