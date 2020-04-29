/* @flow */

import { toArray } from '../util/index'

/**
 * 定义安装Vue插件API：use
 * @param {GlobalAPI} Vue Vue构造方法
 */
export function initUse (Vue: GlobalAPI) {
  /**
   * @param {Function | Object} plugin Vue构造方法
   */
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = [])) // 以安装插件列表
    if (installedPlugins.indexOf(plugin) > -1) { // 已安装plugin插件
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1) // 截取除第一个参数外的其他参数，第一个参数的位置保留
    args.unshift(this)
    if (typeof plugin.install === 'function') { // plugin包含install方法
      plugin.install.apply(plugin, args) // 调用插件的install方法，传入参数列表，第一个参数为当前Vue构造器，其余为use API除第一个参数外的其他参数
    } else if (typeof plugin === 'function') { // plugin本身就是方法
      plugin.apply(null, args) // 调用，传入参数列表，第一个参数为当前Vue构造器，其余为use API除第一个参数外的其他参数
    }
    installedPlugins.push(plugin) // 将插件记录到已安装插件列表中
    return this
  }
}
