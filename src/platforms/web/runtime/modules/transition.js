/* @flow */

import { inBrowser, isIE9, warn } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { activeInstance } from 'core/instance/lifecycle'

import {
  once,
  isDef,
  isUndef,
  isObject,
  toNumber
} from 'shared/util'

import {
  nextFrame,
  resolveTransition,
  whenTransitionEnds,
  addTransitionClass,
  removeTransitionClass
} from '../transition-util'

/**
 * 实现节点进入的过渡效果
 * @param {VNodeWithData} vnode 虚拟节点
 * @param {Function} toggleDisplay 节点展示的回调
 */
export function enter (vnode: VNodeWithData, toggleDisplay: ?() => void) {
  const el: any = vnode.elm // 虚拟节点渲染结果

  // call leave callback now
  if (isDef(el._leaveCb)) { // 如果节点离开过渡的回调函数存在，则执行之。由于_leaveCb为一次性函数，所以存在该回调，即表示离开过渡未执行完，需要在进入过渡执行前，先离开
    el._leaveCb.cancelled = true
    el._leaveCb()
  }

  const data = resolveTransition(vnode.data.transition) // 获得过渡动画的属性对象
  if (isUndef(data)) {
    return
  }

  /* istanbul ignore if */
  if (isDef(el._enterCb) || el.nodeType !== 1) { // 如果_enterCb存在，即该函数已执行，或节点不是元素
    return
  }

  const {
    css, // 是否使用 CSS 过渡类
    type, // 指定过渡事件类型，侦听过渡何时结束。有效值为 "transition" 和 "animation"。
    enterClass, // 进入过渡开始类
    enterToClass, // 进入过渡结束类
    enterActiveClass, // 进入过渡生效类
    appearClass, // 初始渲染过渡开始类
    appearToClass, // 初始渲染过渡结束类
    appearActiveClass, // 初始渲染过渡生效类
    beforeEnter, // 进入过渡开始之前的钩子
    enter, // 进入过渡开始的钩子
    afterEnter, // 进入过渡开始之后的钩子
    enterCancelled,// 进入过渡取消钩子
    beforeAppear, // 初始渲染过渡开始之前的钩子
    appear, // 是否在初始渲染时使用过渡。或初始渲染过渡开始的钩子
    afterAppear, // 初始渲染过渡开始之后的钩子
    appearCancelled, // 初始渲染过渡取消钩子
    duration // 指定过渡的持续时间
  } = data // 从过渡动画的属性对象中取出相关属性

  // activeInstance will always be the <transition> component managing this
  // transition. One edge case to check is when the <transition> is placed
  // as the root node of a child component. In that case we need to check
  // <transition>'s parent for appear check.
  let context = activeInstance // 正在激活的Vue实例，即<transition>所对应的实例
  let transitionNode = activeInstance.$vnode // Vue实例的占位节点，即<transition>节点作为根节点
  while (transitionNode && transitionNode.parent) { // 向上遍历组件占位节点作为根节点的组件
    context = transitionNode.context
    transitionNode = transitionNode.parent
  }

  const isAppear = !context._isMounted || !vnode.isRootInsert // 处于待初始渲染状态。当前激活的Vue实例未挂载，或虚拟节点不是根节点

  if (isAppear && !appear && appear !== '') { // 不在初始渲染时使用过渡
    return
  }

  const startClass = isAppear && appearClass // 过渡开始类
    ? appearClass // 初始渲染过渡开始类
    : enterClass // 进入过渡开始类
  const activeClass = isAppear && appearActiveClass // 过渡生效类
    ? appearActiveClass // 初始渲染过渡生效类
    : enterActiveClass // 进入过渡生效类
  const toClass = isAppear && appearToClass // 过渡结束类
    ? appearToClass // 初始渲染过渡结束类
    : enterToClass // 进入过渡结束类

  const beforeEnterHook = isAppear // 初始渲染或进入过渡开始之前的钩子
    ? (beforeAppear || beforeEnter)
    : beforeEnter
  const enterHook = isAppear // 初始渲染或进入过渡开始的钩子
    ? (typeof appear === 'function' ? appear : enter)
    : enter
  const afterEnterHook = isAppear // 初始渲染或进入过渡开始之后的钩子
    ? (afterAppear || afterEnter)
    : afterEnter
  const enterCancelledHook = isAppear // 初始渲染或进入过渡取消钩子
    ? (appearCancelled || enterCancelled)
    : enterCancelled

  const explicitEnterDuration: any = toNumber( // 进入过渡的持续时间
    isObject(duration)
      ? duration.enter
      : duration
  )

  if (process.env.NODE_ENV !== 'production' && explicitEnterDuration != null) {
    checkDuration(explicitEnterDuration, 'enter', vnode)
  }

  const expectsCSS = css !== false && !isIE9 // 使用CSS过渡类，且不是IE9
  const userWantsControl = getHookArgumentsLength(enterHook) // 获取进入过渡开始的钩子的参数长度 TODO：这个判断的意义是什么

  const cb = el._enterCb = once(() => { // 设置一次性的进入过渡开始的回调函数（执行取消或进入过渡结束的相关操作）
    if (expectsCSS) { // 使用CSS过渡类
      removeTransitionClass(el, toClass) // 移除初始渲染或进入过渡结束类
      removeTransitionClass(el, activeClass) // 移除初始渲染或进入过渡生效类
    }
    if (cb.cancelled) { // 回调函数取消标志
      if (expectsCSS) { // 使用CSS过渡类
        removeTransitionClass(el, startClass) // 移除初始渲染或进入过渡的开始类
      }
      enterCancelledHook && enterCancelledHook(el) // 执行初始渲染或进入过渡取消钩子
    } else {
      afterEnterHook && afterEnterHook(el) // 执行初始渲染或进入过渡开始之后的钩子
    }
    el._enterCb = null // 删除回调函数
  })

  if (!vnode.data.show) { // 节点隐藏，延迟执行初始渲染或进入过渡开始的钩子
    // remove pending leave element on enter by injecting an insert hook
    mergeVNodeHook(vnode, 'insert', () => { // 合并虚拟节点的insert钩子
      const parent = el.parentNode // 父DOM节点
      const pendingNode = parent && parent._pending && parent._pending[vnode.key] // _pending是虚拟节点的key属性到虚拟节点的映射
      if (pendingNode &&
        pendingNode.tag === vnode.tag &&
        pendingNode.elm._leaveCb
      ) {
        pendingNode.elm._leaveCb() // 执行虚拟节点的离开过渡的回调函数，_leaveCb为一次性函数，_leaveCb存在，表示当前节点离开过渡未执行完，需要在进入过渡之前先离开
      }
      enterHook && enterHook(el, cb) // 执行初始渲染或进入过渡开始的钩子
    })
  }

  // start enter transition
  beforeEnterHook && beforeEnterHook(el) // 执行初始渲染或进入过渡开始之前的钩子
  if (expectsCSS) { // 使用CSS过渡类
    addTransitionClass(el, startClass) // 添加初始渲染或进入的过渡开始类
    addTransitionClass(el, activeClass) // 添加初始渲染或进入的过渡生效类
    nextFrame(() => { // 下一帧调用
      removeTransitionClass(el, startClass) // 移除初始渲染或进入的过渡开始类
      if (!cb.cancelled) { // 进入过渡开始的回调函数未取消
        addTransitionClass(el, toClass) // 添加初始渲染或进入的过渡结束类
        if (!userWantsControl) { // 进入过渡开始的钩子的参数长度为0
          if (isValidDuration(explicitEnterDuration)) { // 进入过渡的持续时间是有效值
            setTimeout(cb, explicitEnterDuration) // 在持续时间结束后执行进入过渡开始的回调函数
          } else {
            whenTransitionEnds(el, type, cb) // 注册指定过渡事件结束后的回调函数
          }
        }
      }
    })
  }

  if (vnode.data.show) { // 节点展示
    toggleDisplay && toggleDisplay() // 节点展示的回调
    enterHook && enterHook(el, cb) // 执行初始渲染或进入过渡开始的钩子
  }

  if (!expectsCSS && !userWantsControl) { // 不使用CSS过渡类，进入过渡开始的钩子的参数长度为0，即开发者没有定制过渡效果
    cb() // 执行一次性的进入过渡开始的回调函数
  }
}

/**
 * 实现节点离开的过渡效果
 * @param {VNodeWithData} vnode 虚拟节点
 * @param {Function} rm 回调函数
 */
export function leave (vnode: VNodeWithData, rm: Function) {
  const el: any = vnode.elm

  // call enter callback now
  if (isDef(el._enterCb)) { // 如果节点进入过渡的回调函数存在，则执行之。由于_enterCb为一次性函数，所以存在该回调，即表示进入过渡未执行完，需要在离开过渡执行前，先进入
    el._enterCb.cancelled = true
    el._enterCb()
  }

  const data = resolveTransition(vnode.data.transition) // 获得过渡动画的属性对象
  if (isUndef(data) || el.nodeType !== 1) { // 节点不是元素
    return rm()
  }

  /* istanbul ignore if */
  if (isDef(el._leaveCb)) { // 如果_leaveCb存在，即该函数已执行
    return
  }

  const {
    css, // 是否使用 CSS 过渡类
    type, // 指定过渡事件类型，侦听过渡何时结束。有效值为 "transition" 和 "animation"。
    leaveClass, // 离开过渡开始类
    leaveToClass, // 离开过渡结束类
    leaveActiveClass, // 离开过渡生效类
    beforeLeave, // 离开过渡开始之前的钩子
    leave, // 离开过渡开始的钩子
    afterLeave, // 离开过渡开始之后的钩子
    leaveCancelled, // 离开过渡取消的钩子
    delayLeave, // 离开过渡延时的钩子
    duration // 指定过渡的持续时间
  } = data // 从过渡动画的属性对象中取出相关属性

  const expectsCSS = css !== false && !isIE9 // 使用CSS过渡类
  const userWantsControl = getHookArgumentsLength(leave) // 获取离开过渡开始的钩子的参数长度 TODO：这个判断的意义是什么

  const explicitLeaveDuration: any = toNumber( // 离开过渡的持续时间
    isObject(duration)
      ? duration.leave
      : duration
  )

  if (process.env.NODE_ENV !== 'production' && isDef(explicitLeaveDuration)) {
    checkDuration(explicitLeaveDuration, 'leave', vnode)
  }

  const cb = el._leaveCb = once(() => { // 设置一次性的离开过渡开始的回调函数（执行取消或离开过渡结束的相关操作）
    if (el.parentNode && el.parentNode._pending) { // DOM节点存在父节点。_pending是虚拟节点的key属性到虚拟节点的映射
      el.parentNode._pending[vnode.key] = null // 清空虚拟节点的引用
    }
    if (expectsCSS) { // 使用CSS过渡类
      removeTransitionClass(el, leaveToClass) // 删除离开过渡结束类
      removeTransitionClass(el, leaveActiveClass) // 删除离开过渡生效类
    }
    if (cb.cancelled) { // 离开过渡开始的回调函数被取消执行
      if (expectsCSS) { // 使用CSS过渡类
        removeTransitionClass(el, leaveClass) // 删除离开过渡开始类
      }
      leaveCancelled && leaveCancelled(el) // 执行离开过渡取消的钩子
    } else {
      rm() // 执行回调
      afterLeave && afterLeave(el) // 执行离开过渡开始之后的钩子
    }
    el._leaveCb = null // 删除一次性的离开过渡开始的回调函数
  })

  if (delayLeave) { // 存在离开过渡延时的钩子
    delayLeave(performLeave) // 执行离开过渡延时的钩子，将实现离开过渡的函数作为参数传入
  } else {
    performLeave() // 实现离开过渡
  }

  /**
   * 实现离开过渡
   */
  function performLeave () {
    // the delayed leave may have already been cancelled
    if (cb.cancelled) { // 一次性的离开过渡开始的回调函数已被取消
      return
    }
    // record leaving element
    if (!vnode.data.show && el.parentNode) { // 节点隐藏，且DOM节点有父节点
      (el.parentNode._pending || (el.parentNode._pending = {}))[(vnode.key: any)] = vnode // 创建虚拟节点key到虚拟节点的映射对象，并在DOM节点的父节点保存该对象 TODO：为什么要这么做
    }
    beforeLeave && beforeLeave(el) // 执行离开过渡开始之前的钩子
    if (expectsCSS) { // 使用CSS过渡类
      addTransitionClass(el, leaveClass) // 添加离开过渡开始类
      addTransitionClass(el, leaveActiveClass) // 添加离开过渡生效类
      nextFrame(() => { // 下一帧调用
        removeTransitionClass(el, leaveClass) // 删除离开过渡开始类
        if (!cb.cancelled) { // 一次性的离开过渡开始的回调函数未取消
          addTransitionClass(el, leaveToClass) // 添加离开过渡结束类
          if (!userWantsControl) { // 离开过渡开始的钩子的参数长度不为0
            if (isValidDuration(explicitLeaveDuration)) { // 离开过渡的持续时间是有效值
              setTimeout(cb, explicitLeaveDuration) // 延迟执行一次性的离开过渡开始的回调函数
            } else {
              whenTransitionEnds(el, type, cb) // 注册指定过渡事件结束后的回调函数
            }
          }
        }
      })
    }
    leave && leave(el, cb) // 执行离开过渡开始的钩子
    if (!expectsCSS && !userWantsControl) { // 不使用CSS过渡类，离开过渡开始的钩子的参数长度为0，即开发者没有定制过渡效果
      cb()
    }
  }
}

// only used in dev mode
function checkDuration (val, name, vnode) {
  if (typeof val !== 'number') {
    warn(
      `<transition> explicit ${name} duration is not a valid number - ` +
      `got ${JSON.stringify(val)}.`,
      vnode.context
    )
  } else if (isNaN(val)) {
    warn(
      `<transition> explicit ${name} duration is NaN - ` +
      'the duration expression might be incorrect.',
      vnode.context
    )
  }
}

/**
 * 传入值是否是有效数字
 * @param {any} val 待验证的值
 */
function isValidDuration (val) {
  return typeof val === 'number' && !isNaN(val)
}

/**
 * 获取钩子函数的参数长度
 * Normalize a transition hook's argument length. The hook may be:
 * - a merged hook (invoker) with the original in .fns
 * - a wrapped component method (check ._length)
 * - a plain function (.length)
 */
function getHookArgumentsLength (fn: Function): boolean {
  if (isUndef(fn)) {
    return false
  }
  const invokerFns = fn.fns
  if (isDef(invokerFns)) {
    // invoker
    return getHookArgumentsLength(
      Array.isArray(invokerFns)
        ? invokerFns[0]
        : invokerFns
    )
  } else {
    return (fn._length || fn.length) > 1
  }
}

/**
 * 实现节点进入的过渡效果
 * @param {any} _
 * @param {VNodeWithData} vnode 虚拟节点
 */
function _enter (_: any, vnode: VNodeWithData) {
  if (vnode.data.show !== true) { // 节点不展示
    enter(vnode) // 实现节点进入的过渡效果
  }
}

export default inBrowser ? {
  create: _enter, // 创建钩子
  activate: _enter, // 激活钩子
  remove (vnode: VNode, rm: Function) {
    /* istanbul ignore else */
    if (vnode.data.show !== true) { // 节点不展示
      leave(vnode, rm) // 实现节点离开的过渡效果
    } else {
      rm() // 执行删除回调，不触发过渡效果。即，不是由v-show引起的节点显隐，是不触发过渡效果的
    }
  }
} : {}
