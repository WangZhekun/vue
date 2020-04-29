/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

/**
 * 定义Vue的静态属性/方法
 * @param {GlobalAPI} Vue Vue构造方法
 */
export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef) // 定义config属性，值在../config.js中定义

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // 定义util属性，其中包含多个工具函数
  Vue.util = {
    warn, // 警告函数
    extend, // 扩展函数
    mergeOptions, // 合并
    defineReactive // 函数：给obj定义一个响应式的属性key
  }

  Vue.set = set // 给指定（响应式）对象/数组添加属性
  Vue.delete = del // 删除指定对象/数组的自有属性/索引
  Vue.nextTick = nextTick // 注册时间片（下次DOM更新循环）结束时的回调

  // 2.6 explicit observable API
  // 让一个对象可响应
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  } // </T> // 为了VS code代码高亮

  Vue.options = Object.create(null) // 全局配置项
  ASSET_TYPES.forEach(type => { // 初始化组件、指令、过滤器配置项
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  // 为了识别base构造函数，以便在Weex的多实例场景中扩展所有纯对象组件
  Vue.options._base = Vue

  extend(Vue.options.components, builtInComponents) // 注册内部组件：KeepAlive

  initUse(Vue) // 定义安装Vue插件API：use
  initMixin(Vue) // 定义全局混入API：mixin
  initExtend(Vue) // 定义创建Vue类的子类API：extend
  initAssetRegisters(Vue) // 定义组件、指令、过滤器API：src/shared/constants.js中的ASSET_TYPES
}
