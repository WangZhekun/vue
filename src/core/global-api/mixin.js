/* @flow */

import { mergeOptions } from '../util/index'

/**
 * 定义混入API：mixin
 * @param {GlobalAPI} Vue Vue构造方法
 */
export function initMixin (Vue: GlobalAPI) {
  /**
   * 将指定对象的属性加入到Vue的全局配置项中
   * @param {Object} mixin 待混入对象
   */
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
