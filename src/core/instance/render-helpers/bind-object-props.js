/* @flow */

import config from 'core/config'

import {
  warn,
  isObject,
  toObject,
  isReservedAttribute,
  camelize,
  hyphenate
} from 'core/util/index'

/**
 * Runtime helper for merging v-bind="object" into a VNode's data.
 */
/**
 * 将v-bind绑定的属性添加到虚拟节点的数据对象的相应位置
 * @param {any} data 虚拟节点的数据对象
 * @param {string} tag 节点名
 * @param {any} value v-bind指令绑定的属性和值组成的对象
 * @param {boolean} asProp 节点特性是否绑定为属性
 * @param {boolean} isSync 属性值同步标志
 */
export function bindObjectProps (
  data: any,
  tag: string,
  value: any,
  asProp: boolean,
  isSync?: boolean
): VNodeData {
  if (value) {
    if (!isObject(value)) { // 不是对象
      process.env.NODE_ENV !== 'production' && warn(
        'v-bind without argument expects an Object or Array value',
        this
      )
    } else {
      if (Array.isArray(value)) { // 绑定对象未数组
        value = toObject(value) // 转成对象
      }
      let hash
      for (const key in value) { // 遍历绑定对象
        if (
          key === 'class' ||
          key === 'style' ||
          isReservedAttribute(key)
        ) { // 绑定的属性是class,style,key,ref,slot,slot-scope,is
          hash = data // TODO: 为什么可以直接用虚拟节点的数据对象
        } else { // 绑定的属性是其他
          const type = data.attrs && data.attrs.type // 取特性中的type属性，如<input type="button">
          hash = asProp || config.mustUseProp(tag, type, key) // 将特性（attribute）绑定为属性（property） TODO：这个有问题
            ? data.domProps || (data.domProps = {}) // DOM属性作为添加属性的目标
            : data.attrs || (data.attrs = {}) // DOM特性作为添加属性的目标
        }
        const camelizedKey = camelize(key) // 将属性转为驼峰式命名方式
        const hyphenatedKey = hyphenate(key) // 将属性转为中横线命名方式
        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) { // 两种命名方式，在hash中都找不到
          hash[key] = value[key] // 添加属性

          if (isSync) { //
            const on = data.on || (data.on = {}) // 事件监听配置对象
            on[`update:${key}`] = function ($event) { // 添加属性对应的更新事件
              value[key] = $event
            }
          }
        }
      }
    }
  }
  return data
}
