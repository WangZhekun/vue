/* @flow */

import {
  tip,
  hasOwn,
  isDef,
  isUndef,
  hyphenate,
  formatComponentName
} from 'core/util/index'

/**
 * 获取组件的属性的绑定对象
 * @param {VNodeData} data 虚拟节点的数据对象
 * @param {Class<Component>} Ctor 虚拟节点对应的组件的构造函数
 * @param {string} tag 节点名
 */
export function extractPropsFromVNodeData (
  data: VNodeData,
  Ctor: Class<Component>,
  tag?: string
): ?Object {
  // we are only extracting raw values here.
  // validation and default values are handled in the child
  // component itself.
  const propOptions = Ctor.options.props // 组件属性
  if (isUndef(propOptions)) {
    return
  }
  const res = {}
  const { attrs, props } = data
  if (isDef(attrs) || isDef(props)) {
    for (const key in propOptions) {
      const altKey = hyphenate(key) // 转化组件属性名的命名为“-”
      if (process.env.NODE_ENV !== 'production') {
        const keyInLowerCase = key.toLowerCase()
        if (
          key !== keyInLowerCase &&
          attrs && hasOwn(attrs, keyInLowerCase)
        ) {
          tip(
            `Prop "${keyInLowerCase}" is passed to component ` +
            `${formatComponentName(tag || Ctor)}, but the declared prop name is` +
            ` "${key}". ` +
            `Note that HTML attributes are case-insensitive and camelCased ` +
            `props need to use their kebab-case equivalents when using in-DOM ` +
            `templates. You should probably use "${altKey}" instead of "${key}".`
          )
        }
      }
      checkProp(res, props, key, altKey, true) || // 将data.props中的key或altKey添加到res中
      checkProp(res, attrs, key, altKey, false) // 将data.attrs中的key或altKey添加到res中，删除attrs中的key或altKey
    }
  }
  return res
}

/**
 * 将hash中的key或altKey添加到res中，返回结果表示添加成功或失败
 * @param {Object} res 结果对象
 * @param {Object} hash 绑定关系对象
 * @param {string} key 属性名
 * @param {string} altKey 转化为“-”格式的属性名
 * @param {boolean} preserve 是否从hash中删除key或altKey的标志，false删除，true不删除
 */
function checkProp (
  res: Object,
  hash: ?Object,
  key: string,
  altKey: string,
  preserve: boolean
): boolean {
  if (isDef(hash)) {
    if (hasOwn(hash, key)) {
      res[key] = hash[key]
      if (!preserve) {
        delete hash[key]
      }
      return true
    } else if (hasOwn(hash, altKey)) {
      res[key] = hash[altKey]
      if (!preserve) {
        delete hash[altKey]
      }
      return true
    }
  }
  return false
}
