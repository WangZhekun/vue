/* @flow */

// Provides transition support for list items.
// supports move transitions using the FLIP technique.

// Because the vdom's children update algorithm is "unstable" - i.e.
// it doesn't guarantee the relative positioning of removed elements,
// we force transition-group to update its children into two passes:
// in the first pass, we remove all nodes that need to be removed,
// triggering their leaving transition; in the second pass, we insert/move
// into the final desired state. This way in the second pass removed
// nodes will remain where they should be.

import { warn, extend } from 'core/util/index'
import { addClass, removeClass } from '../class-util'
import { transitionProps, extractTransitionData } from './transition'
import { setActiveInstance } from 'core/instance/lifecycle'

import {
  hasTransition,
  getTransitionInfo,
  transitionEndEvent,
  addTransitionClass,
  removeTransitionClass
} from '../transition-util'

const props = extend({
  tag: String, // 默认为 span。<transition-group> 渲染一个真实的 DOM 元素。默认渲染 <span>，可以通过 tag attribute 配置哪个元素应该被渲染。
  moveClass: String // 覆盖移动过渡期间应用的 CSS 类。
}, transitionProps)

delete props.mode

export default {
  props,

  beforeMount () {
    const update = this._update
    this._update = (vnode, hydrating) => { // 重写组件的_update方法。_update方法：更新虚拟节点树，并重新渲染
      const restoreActiveInstance = setActiveInstance(this) // 设置正在激活的Vue实例
      // force removing pass
      this.__patch__( // 重新渲染VNode树 TODO：在_update中会执行__patch__，为什么这里还要执行一遍
        this._vnode,
        this.kept, // 以需要保留的旧子节点作为子节点的虚拟节点
        false, // hydrating
        true // removeOnly (!important, avoids unnecessary moves)
      )
      this._vnode = this.kept // 更新虚拟节点树
      restoreActiveInstance() // 还原正在激活的Vue实例
      update.call(this, vnode, hydrating) // 调用旧的_update方法
    }
  },

  render (h: Function) {
    const tag: string = this.tag || this.$vnode.data.tag || 'span' // 取tag属性，或该组件在父组件中的占位节点的名称
    const map: Object = Object.create(null) // 插槽内容的各节点的key到节点的映射
    const prevChildren: Array<VNode> = this.prevChildren = this.children // 旧子节点
    const rawChildren: Array<VNode> = this.$slots.default || [] // 默认插槽内容
    const children: Array<VNode> = this.children = [] // 新子节点
    const transitionData: Object = extractTransitionData(this) // 获取当前组件的占位节点上的属性和事件

    for (let i = 0; i < rawChildren.length; i++) { // 遍历插槽内容，填充children和map
      const c: VNode = rawChildren[i]
      if (c.tag) { // 插槽内容的元素的节点名称
        if (c.key != null && String(c.key).indexOf('__vlist') !== 0) { // 节点有key属性，且不是以__vlist开头的
          children.push(c) // 将该节点加入到新子节点列表中
          map[c.key] = c
          ;(c.data || (c.data = {})).transition = transitionData // 置节点的数据对象
        } else if (process.env.NODE_ENV !== 'production') {
          const opts: ?VNodeComponentOptions = c.componentOptions
          const name: string = opts ? (opts.Ctor.options.name || opts.tag || '') : c.tag
          warn(`<transition-group> children must be keyed: <${name}>`)
        }
      }
    }

    if (prevChildren) { // 存在旧子节点
      const kept: Array<VNode> = [] // 需要保留的旧子节点
      const removed: Array<VNode> = [] // 需要删除的旧子节点
      for (let i = 0; i < prevChildren.length; i++) { // 遍历旧子节点
        const c: VNode = prevChildren[i]
        c.data.transition = transitionData // 置旧节点的数据对象
        c.data.pos = c.elm.getBoundingClientRect() // 获取元素的大小及其相对于视口的位置
        if (map[c.key]) { // 存在相同key属性的新子节点
          kept.push(c) // 将该节点加入到需要保留的旧子节点列表中
        } else { // 不存在相同key属性的新子节点
          removed.push(c) // 将该节点加入到需要删除的旧子节点列表中
        }
      }
      this.kept = h(tag, null, kept) // 创建节点，将需要保留的旧子节点作为该节点的子节点
      this.removed = removed // 需要删除的旧子节点
    }

    return h(tag, null, children) // 创建新节点
  },

  updated () {
    const children: Array<VNode> = this.prevChildren // 旧子节点
    const moveClass: string = this.moveClass || ((this.name || 'v') + '-move') // 移动过渡节点的CSS类
    if (!children.length || !this.hasMove(children[0].elm, moveClass)) { // 没有旧子节点，或第一个旧子节点的移动过渡类，没有应用到转换（transform）样式
      return
    }

    // we divide the work into three loops to avoid mixing DOM reads and writes
    // in each iteration - which helps prevent layout thrashing.
    children.forEach(callPendingCbs) // 执行旧子节点的_moveCb（过渡结束事件回调）和_enterCb回调
    children.forEach(recordPosition) // 更新旧子节点的位置信息
    children.forEach(applyTranslation) // 对旧子节点应用移动样式

    // force reflow to put everything in position
    // assign to this to avoid being removed in tree-shaking
    // $flow-disable-line
    this._reflow = document.body.offsetHeight // 网页可见区域高

    children.forEach((c: VNode) => { // 遍历旧子节点
      if (c.data.moved) { // 旧子节点移动标志为true
        const el: any = c.elm // 旧子节点的DOM节点
        const s: any = el.style // 旧子节点的DOM节点的样式对象
        addTransitionClass(el, moveClass) // 给旧子节点的DOM节点添加移动类
        s.transform = s.WebkitTransform = s.transitionDuration = '' // 清空转换和过渡时间的样式
        el.addEventListener(transitionEndEvent, el._moveCb = function cb (e) { // 添加过渡结束事件
          if (e && e.target !== el) { // 事件是当前节点的事件
            return
          }
          if (!e || /transform$/.test(e.propertyName)) { // 当发生transitionend事件时，propertyName属性返回与转换关联的CSS属性的名称。事件对象不存在（_moveCb方法被手动调用），或事件发生的关联CSS属性是transform
            el.removeEventListener(transitionEndEvent, cb) // 删除事件监听
            el._moveCb = null // 删除_moveCb回调
            removeTransitionClass(el, moveClass) // 从旧子节点的DOM节点中移除移动过渡类。
          }
        })
      }
    })
  },

  methods: {
    hasMove (el: any, moveClass: string): boolean { // 获取el节点的移动过渡类，是否应用到转换（transform）样式
      /* istanbul ignore if */
      if (!hasTransition) { // 浏览器支持过渡
        return false
      }
      /* istanbul ignore if */
      if (this._hasMove) {
        return this._hasMove
      }
      // Detect whether an element with the move class applied has
      // CSS transitions. Since the element may be inside an entering
      // transition at this very moment, we make a clone of it and remove
      // all other transition classes applied to ensure only the move class
      // is applied.
      const clone: HTMLElement = el.cloneNode() // 复制DOM节点
      if (el._transitionClasses) { // DOM节点的过渡类
        el._transitionClasses.forEach((cls: string) => { removeClass(clone, cls) }) // 从复制的DOM节点的class列表中移除过渡类
      }
      addClass(clone, moveClass) // 给复制的DOM节点添加移动过渡类
      clone.style.display = 'none' // 复制的DOM节点不展示
      this.$el.appendChild(clone) // 将复制的DOM节点作为该组件的挂载节点的子节点
      const info: Object = getTransitionInfo(clone) // 获取过渡相关信息
      this.$el.removeChild(clone) // 将复制的DOM节点从该组件的挂载节点的子节点中移除
      return (this._hasMove = info.hasTransform) // 过渡效果是否应用到转换（transform）样式
    }
  }
}

/**
 * 执行虚拟节点的DOM节点的_moveCb和_enterCb回调
 * @param {VNode} c 虚拟节点
 */
function callPendingCbs (c: VNode) {
  /* istanbul ignore if */
  if (c.elm._moveCb) {
    c.elm._moveCb()
  }
  /* istanbul ignore if */
  if (c.elm._enterCb) {
    c.elm._enterCb()
  }
}

/**
 * 更新虚拟节点的DOM节点的大小及其相对于视口的位置
 * @param {VNode} c 虚拟节点
 */
function recordPosition (c: VNode) {
  c.data.newPos = c.elm.getBoundingClientRect()
}

/**
 * 应用移动样式
 * @param {VNode} c 虚拟节点
 */
function applyTranslation (c: VNode) {
  const oldPos = c.data.pos // 虚拟节点的DOM节点的旧的大小及其相对于视口的位置信息
  const newPos = c.data.newPos // 虚拟节点的DOM节点的新的大小及其相对于视口的位置信息
  const dx = oldPos.left - newPos.left // 旧位置与新位置的横坐标的差值
  const dy = oldPos.top - newPos.top // 旧位置与新位置的纵坐标的差值
  if (dx || dy) { // 横坐标或纵坐标的差值存在
    c.data.moved = true // 虚拟节点的移动标志
    const s = c.elm.style
    s.transform = s.WebkitTransform = `translate(${dx}px,${dy}px)` // 置移动样式
    s.transitionDuration = '0s' // 置过渡时间
  }
}
