/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

/**
 * 初始化provide
 * @param {Component} vm Vue实例
 */
export function initProvide (vm: Component) {
  const provide = vm.$options.provide // provide是直接在配置中定义，不进行响应式处理
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

/**
 * 初始化vm注入的内容
 * @param {Component} vm Vue实例
 */
export function initInjections (vm: Component) {
  const result = resolveInject(vm.$options.inject, vm) // 获取注入的各属性的注入值
  if (result) {
    toggleObserving(false) // 修改全局的是否可监听配置为不可监听
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key]) // 给Vue实例定义一个响应式的属性key，即将注入的属性和值添加到Vue实例中，但不对属性值添加Observer实例，即不可添加新属性。这里会重新创建key对应的Dep实例
      }
    })
    toggleObserving(true) // 修改全局的是否可监听配置为可监听
  }
}

/**
 * 获取注入的各属性的注入值
 * @param {any} inject Vue实例的注入配置
 * @param {Component} vm Vue实例
 */
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol // 获取注入配置对象的属性列表
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) { // 遍历属性
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from // 注入来源的属性名
      let source = vm
      while (source) { // 遍历Vue实例的父实例，获取能提供注入来源属性名的值
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      if (!source) {
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
