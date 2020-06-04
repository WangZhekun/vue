/* @flow */

import { identity, resolveAsset } from 'core/util/index'

/**
 * Runtime helper for resolving filters
 */
/**
 * 获取指定id的过滤器
 * @param {string} id 过滤器名称
 */
export function resolveFilter (id: string): Function {
  return resolveAsset(this.$options, 'filters', id, true) || identity // 获取配置对象中指定id的过滤器。identity是一个返回唯一入参的函数
}
