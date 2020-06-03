/* @flow */

import { inBrowser, isIE9 } from 'core/util/index'
import { addClass, removeClass } from './class-util'
import { remove, extend, cached } from 'shared/util'

/**
 * 获取过渡动画的属性对象
 * @param {string | Object} def
 */
export function resolveTransition (def?: string | Object): ?Object {
  if (!def) {
    return
  }
  /* istanbul ignore else */
  if (typeof def === 'object') {
    const res = {}
    if (def.css !== false) { // 使用 CSS 过渡类
      extend(res, autoCssTransition(def.name || 'v')) // 将过渡动画类名转化为对象
    }
    extend(res, def)
    return res
  } else if (typeof def === 'string') {
    return autoCssTransition(def) // 将过渡动画类名转化为对象
  }
}

/**
 * 将过渡动画类名转化为对象，其中包含各个环节的类名
 * @param {string} name 过渡动画的类名
 */
const autoCssTransition: (name: string) => Object = cached(name => {
  return {
    enterClass: `${name}-enter`,
    enterToClass: `${name}-enter-to`,
    enterActiveClass: `${name}-enter-active`,
    leaveClass: `${name}-leave`,
    leaveToClass: `${name}-leave-to`,
    leaveActiveClass: `${name}-leave-active`
  }
})

export const hasTransition = inBrowser && !isIE9
const TRANSITION = 'transition'
const ANIMATION = 'animation'

// Transition property/event sniffing
export let transitionProp = 'transition'
export let transitionEndEvent = 'transitionend'
export let animationProp = 'animation'
export let animationEndEvent = 'animationend'
if (hasTransition) {
  /* istanbul ignore if */
  if (window.ontransitionend === undefined &&
    window.onwebkittransitionend !== undefined
  ) {
    transitionProp = 'WebkitTransition'
    transitionEndEvent = 'webkitTransitionEnd'
  }
  if (window.onanimationend === undefined &&
    window.onwebkitanimationend !== undefined
  ) {
    animationProp = 'WebkitAnimation'
    animationEndEvent = 'webkitAnimationEnd'
  }
}

// binding to window is necessary to make hot reload work in IE in strict mode
const raf = inBrowser
  ? window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window) // 下一次重绘之前调用
    : setTimeout // 主进程执行完成后执行
  : /* istanbul ignore next */ fn => fn()

/**
 * 下一帧调用
 * @param {Function} fn 回调函数
 */
export function nextFrame (fn: Function) {
  raf(() => {
    raf(fn)
  })
}

/**
 * 添加指定DOM节点的过渡类
 * @param {Element} el DOM节点
 * @param {string} cls 过渡类
 */
export function addTransitionClass (el: any, cls: string) {
  const transitionClasses = el._transitionClasses || (el._transitionClasses = [])
  if (transitionClasses.indexOf(cls) < 0) {
    transitionClasses.push(cls)
    addClass(el, cls)
  }
}

/**
 * 移除指定DOM节点的过渡类
 * @param {Element} el DOM节点
 * @param {string} cls 过渡类
 */
export function removeTransitionClass (el: any, cls: string) {
  if (el._transitionClasses) {
    remove(el._transitionClasses, cls)
  }
  removeClass(el, cls)
}

/**
 * 注册指定过渡事件结束后的回调函数
 * @param {Element} el DOM节点
 * @param {string} expectedType 过渡事件类型，侦听过渡何时结束
 * @param {Function} cb 回调函数
 */
export function whenTransitionEnds (
  el: Element,
  expectedType: ?string,
  cb: Function
) {
  const { type, timeout, propCount } = getTransitionInfo(el, expectedType) // 获取过渡相关的信息
  if (!type) return cb() // 没有侦听的过渡事件类型，执行回调函数，并结束
  const event: string = type === TRANSITION ? transitionEndEvent : animationEndEvent // 过渡/动画结束事件名称
  let ended = 0
  const end = () => { // 移除过渡/动画结束事件，并执行回调函数
    el.removeEventListener(event, onEnd) // 移除过渡/动画结束事件
    cb()
  }
  const onEnd = e => { // 过渡/动画结束事件执行函数
    if (e.target === el) {
      if (++ended >= propCount) { // 过渡/动画持续时间数组的长度，执行相同数量的end函数
        end()
      }
    }
  }
  setTimeout(() => {
    if (ended < propCount) {
      end()
    }
  }, timeout + 1) // 在过渡/动画结束后1毫秒，如果还没有触发过渡/动画结束事件，则结束之 TODO：这里为什么不执行propCount次end函数
  el.addEventListener(event, onEnd) // 注册过渡/动画结束事件
}

const transformRE = /\b(transform|all)(,|$)/

/**
 * 获取过渡相关的信息
 * @param {Element} el DOM节点
 * @param {string} expectedType 过渡事件类型，侦听过渡何时结束
 */
export function getTransitionInfo (el: Element, expectedType?: ?string): {
  type: ?string;
  propCount: number;
  timeout: number;
  hasTransform: boolean;
} {
  const styles: any = window.getComputedStyle(el) // 获取计算后元素的所有CSS属性的值
  // JSDOM may return undefined for transition properties
  const transitionDelays: Array<string> = (styles[transitionProp + 'Delay'] || '').split(', ') // transitionDelay样式，过渡开始的延迟时间
  const transitionDurations: Array<string> = (styles[transitionProp + 'Duration'] || '').split(', ') // transitionDuration样式，过渡效果的持续时间
  const transitionTimeout: number = getTimeout(transitionDelays, transitionDurations) // 取最大的过渡耗时，单位为毫秒
  const animationDelays: Array<string> = (styles[animationProp + 'Delay'] || '').split(', ') // animationDelay样式，动画开始的延迟时间
  const animationDurations: Array<string> = (styles[animationProp + 'Duration'] || '').split(', ') // animationDuration样式，动画效果的持续时间
  const animationTimeout: number = getTimeout(animationDelays, animationDurations) // 取最大的动画耗时，单位为毫秒

  let type: ?string // 侦听的过渡事件类型
  let timeout = 0 // 过渡/动画耗时
  let propCount = 0 // 过渡/动画持续时间数组的长度
  /* istanbul ignore if */
  if (expectedType === TRANSITION) { // 侦听的过渡事件为transition，过渡
    if (transitionTimeout > 0) { // 最大的过渡耗时大于0
      type = TRANSITION
      timeout = transitionTimeout
      propCount = transitionDurations.length
    }
  } else if (expectedType === ANIMATION) { // 侦听的过渡事件为animation，动画
    if (animationTimeout > 0) { // 最大的动画耗时大于0
      type = ANIMATION
      timeout = animationTimeout
      propCount = animationDurations.length
    }
  } else {
    timeout = Math.max(transitionTimeout, animationTimeout) // 取最大的过渡耗时和最大的动画耗时的最大值
    type = timeout > 0 // 过渡/动画耗时大于0，取更大的那个事件类型，否则为null
      ? transitionTimeout > animationTimeout
        ? TRANSITION
        : ANIMATION
      : null
    propCount = type // 根据事件类型，获取对应的持续时间数组的长度
      ? type === TRANSITION
        ? transitionDurations.length
        : animationDurations.length
      : 0
  }
  const hasTransform: boolean = // 过渡是否应用到转换transform
    type === TRANSITION &&
    transformRE.test(styles[transitionProp + 'Property']) // transitionProperty样式，应用过渡效果的css属性。应用过渡效果的是转换（transform）或全部
  return {
    type, // 侦听的过渡事件类型
    timeout, // 过渡/动画耗时
    propCount, // 过渡/动画持续时间数组的长度
    hasTransform // 过渡是否应用到转换transform
  }
}

/**
 * 获取最大的过渡效果耗时
 * @param {Array<string>} delays 延迟时间
 * @param {Array<string>} durations 持续时间
 */
function getTimeout (delays: Array<string>, durations: Array<string>): number {
  /* istanbul ignore next */
  while (delays.length < durations.length) { // 延迟时间数组复制自身，长度延长到大于等于持续时间数组
    delays = delays.concat(delays)
  }

  return Math.max.apply(null, durations.map((d, i) => { // 取最大的过渡耗时
    return toMs(d) + toMs(delays[i]) // 持续时间 + 延迟时间，结果为毫秒
  }))
}

// Old versions of Chromium (below 61.0.3163.100) formats floating pointer numbers
// in a locale-dependent way, using a comma instead of a dot.
// If comma is not replaced with a dot, the input will be rounded down (i.e. acting
// as a floor function) causing unexpected behaviors
/**
 * 将单位为秒的时间，转化为毫秒
 * @param {string} s 时间，单位为秒
 */
function toMs (s: string): number {
  return Number(s.slice(0, -1).replace(',', '.')) * 1000
}
