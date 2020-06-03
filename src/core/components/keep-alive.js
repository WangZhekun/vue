/* @flow */

import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

type VNodeCache = { [key: string]: ?VNode };

/**
 * 取组件名称
 * @param {VNodeComponentOptions} opts 占位节点对应的组件的配置项
 */
function getComponentName (opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag) // 取组件配置对象中的name，或占位节点的名称
}

/**
 * 根据检查规则检查名称是否符合
 * @param {string | RegExp | Array<string>} pattern 校验规则
 * @param {string} name 待检查名称
 */
function matches (pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

/**
 * 按照指定的过滤方法清理缓存
 * @param {any} keepAliveInstance keepAlive组件实例
 * @param {Function} filter 过滤方法
 */
function pruneCache (keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance
  for (const key in cache) { // 遍历虚拟节点（占位节点）的缓存对象
    const cachedNode: ?VNode = cache[key] // 被缓存的虚拟节点（占位节点）
    if (cachedNode) {
      const name: ?string = getComponentName(cachedNode.componentOptions) // 取组件名称
      if (name && !filter(name)) { // 名称存在，且过滤方法返回false
        pruneCacheEntry(cache, key, keys, _vnode) // 清理缓存
      }
    }
  }
}

/**
 * 清理指定缓存
 * @param {VNodeCache} cache 缓存的虚拟节点（占位节点）
 * @param {string} key 待清理的key
 * @param {Array<string>} keys 被缓存的虚拟节点（占位节点）的key
 * @param {VNode} current 最新的虚拟节点（占位节点）
 */
function pruneCacheEntry (
  cache: VNodeCache,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  const cached = cache[key] // 取缓存的虚拟节点（占位节点）
  if (cached && (!current || cached.tag !== current.tag)) { // 当前虚拟节点（占位节点）不存在，或节点名称与缓存的不同
    cached.componentInstance.$destroy() // 销毁虚拟节点（占位节点）对应组件实例
  }
  cache[key] = null // 删除该虚拟节点的缓存
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]

export default {
  name: 'keep-alive', // 组件名称
  abstract: true, // 抽象组件，即它自身不会渲染一个 DOM 元素，也不会出现在组件的父组件链中。

  props: {
    include: patternTypes, // 只有名称匹配的组件会被缓存
    exclude: patternTypes, // 任何名称匹配的组件都不会被缓存
    max: [String, Number] // 最多可以缓存多少组件实例
  },

  created () {
    this.cache = Object.create(null) // 初始化虚拟节点（占位节点）的缓存对象
    this.keys = [] // 被缓存的虚拟节点（占位节点）的key
  },

  destroyed () {
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted () {
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name)) // 清理不在include属性中包含的缓存
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name)) // 清理在exclude属性中包含的缓存
    })
  },

  render () {
    const slot = this.$slots.default // 取默认插槽
    const vnode: VNode = getFirstComponentChild(slot) // 获取插槽中第一个组件的占位节点
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions // 虚拟节点（占位节点）的对应组件的配置项
    if (componentOptions) {
      // check pattern
      const name: ?string = getComponentName(componentOptions) // 取虚拟节点（占位节点）对应组件的名称
      const { include, exclude } = this
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) { // 不缓存
        return vnode
      }

      const { cache, keys } = this
      const key: ?string = vnode.key == null // 如果虚拟节点的key属性为空，则根据虚拟节点（占位节点）对应的组件的类id和虚拟节点名称组合的字符串，否则取虚拟节点的key属性
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      if (cache[key]) { // 已经被缓存
        vnode.componentInstance = cache[key].componentInstance // 提取缓存的组件实例
        // make current key freshest
        remove(keys, key)
        keys.push(key) // 更新key
      } else { // 没有缓存
        cache[key] = vnode // 添加缓存
        keys.push(key) // 添加key
        // prune oldest entry
        if (this.max && keys.length > parseInt(this.max)) { // 缓存数量大于最大缓存数
          pruneCacheEntry(cache, keys[0], keys, this._vnode) // 清理第一个缓存 _vnode是keepAlive的虚拟节点 TODO：_vnode这个是如何传递的
        }
      }

      vnode.data.keepAlive = true // 虚拟节点（占位节点）的配置数据对象中的keepAlive置为true，表示被缓存
    }
    return vnode || (slot && slot[0]) // 如果子节点中存在组件的占位节点，则返回虚拟节点，否则返回插槽的第一个节点
  }
}
