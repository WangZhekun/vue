/* @flow */

// Provides transition support for a single element/component.
// supports transition mode (out-in / in-out)

import { warn } from 'core/util/index'
import { camelize, extend, isPrimitive } from 'shared/util'
import {
  mergeVNodeHook,
  isAsyncPlaceholder,
  getFirstComponentChild
} from 'core/vdom/helpers/index'

/**
 * transition组件的属性
 */
export const transitionProps = {
  name: String, // 用于自动生成 CSS 过渡类名
  appear: Boolean, // 是否在初始渲染时使用过渡。默认为 false
  css: Boolean, // 是否使用 CSS 过渡类。默认为 true。如果设置为 false，将只通过组件事件触发注册的 JavaScript 钩子。
  mode: String, // 控制离开/进入过渡的时间序列。有效的模式有 "out-in" 和 "in-out"；默认同时进行。
  type: String, // 指定过渡事件类型，侦听过渡何时结束。有效值为 "transition" 和 "animation"。默认 Vue.js 将自动检测出持续时间长的为过渡事件类型。
  enterClass: String, // 进入过渡开始类
  leaveClass: String, // 离开过渡开始类
  enterToClass: String, // 进入过渡结束类
  leaveToClass: String, // 离开过渡结束类
  enterActiveClass: String, // 进入过渡生效类
  leaveActiveClass: String, // 离开过渡生效类
  appearClass: String, // 初始渲染过渡开始类
  appearActiveClass: String, // 初始渲染过渡生效类
  appearToClass: String, // 初始渲染过渡结束类
  duration: [Number, String, Object] // 指定过渡的持续时间。默认情况下，Vue 会等待过渡所在根元素的第一个 transitionend 或 animationend 事件。
}

// in case the child is also an abstract component, e.g. <keep-alive>
// we want to recursively retrieve the real component to be rendered
/**
 * 向下遍历，获取真正的节点，即非抽象节点（如<keep-alive>）
 * @param {VNode} vnode 虚拟节点
 */
function getRealChild (vnode: ?VNode): ?VNode {
  const compOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
  if (compOptions && compOptions.Ctor.options.abstract) {
    return getRealChild(getFirstComponentChild(compOptions.children)) // 获取子组件中第一个组件的占位节点
  } else {
    return vnode
  }
}

/**
 * 获取组件的占位节点上的属性和事件
 * @param {Component} comp <transition>组件实例
 */
export function extractTransitionData (comp: Component): Object {
  const data = {}
  const options: ComponentOptions = comp.$options // 组件实例的完整配置项
  // props
  for (const key in options.propsData) { // 遍历组件的占位节点的属性绑定对象
    data[key] = comp[key]
  }
  // events.
  // extract listeners and pass them directly to the transition methods
  const listeners: ?Object = options._parentListeners
  for (const key in listeners) { // 遍历组件的占位节点的监听事件
    data[camelize(key)] = listeners[key]
  }
  return data
}

/**
 * 如果虚拟节点的标签是以-keep-alive结尾，则创建并返回对应的keep-alive节点
 * @param {Function} h 创建节点函数
 * @param {VNode} rawChild 虚拟节点
 */
function placeholder (h: Function, rawChild: VNode): ?VNode {
  if (/\d-keep-alive$/.test(rawChild.tag)) {
    return h('keep-alive', {
      props: rawChild.componentOptions.propsData
    })
  }
}

/**
 * 虚拟节点所在组件在其父组件中的占位节点也在<transition>或<transition-group>中，组件的占位节点作为父组件的根节点，则一直向上遍历
 * @param {VNode} vnode 待检测虚拟节点
 */
function hasParentTransition (vnode: VNode): ?boolean {
  while ((vnode = vnode.parent)) { // vnode.parent是vnode所在组件在其父组件中的占位节点，vnode是其所在组件的根节点
    if (vnode.data.transition) { // 占位节点也在<transition>或<transition-group>中
      return true
    }
  }
}

function isSameChild (child: VNode, oldChild: VNode): boolean {
  return oldChild.key === child.key && oldChild.tag === child.tag
}

/**
 * 检测虚拟节点是不是非文本节点
 * @param {VNode} c 待测试虚拟节点
 */
const isNotTextNode = (c: VNode) => c.tag || isAsyncPlaceholder(c) // 存在标签名，或是组件的占位节点

const isVShowDirective = d => d.name === 'show'

/**
 * transition组件 TODO：这个组件与platforms/web/runtime/modules/transition.js有什么关联？
 */
export default {
  name: 'transition',
  props: transitionProps,
  abstract: true, // 抽象组件

  render (h: Function) {
    let children: any = this.$slots.default // 取默认插槽内容
    if (!children) { // 插槽内容为空
      return
    }

    // filter out text nodes (possible whitespaces)
    children = children.filter(isNotTextNode) // 过滤文本节点
    /* istanbul ignore if */
    if (!children.length) { // 插槽内容全是文本节点
      return
    }

    // warn multiple elements
    if (process.env.NODE_ENV !== 'production' && children.length > 1) {
      warn(
        '<transition> can only be used on a single element. Use ' +
        '<transition-group> for lists.',
        this.$parent
      )
    }

    const mode: string = this.mode // mode属性：控制离开/进入过渡的时间序列。有效的模式有 "out-in" 和 "in-out"；默认同时进行。

    // warn invalid mode
    if (process.env.NODE_ENV !== 'production' &&
      mode && mode !== 'in-out' && mode !== 'out-in'
    ) {
      warn(
        'invalid <transition> mode: ' + mode,
        this.$parent
      )
    }

    const rawChild: VNode = children[0] // 取插槽内容的第一个节点

    // if this is a component root node and the component's
    // parent container node also has transition, skip.
    if (hasParentTransition(this.$vnode)) { // this.$vnode是当前组件在其父组件的占位节点，检测向上遍历，还有父组件在<transition>或<transition-group>中
      return rawChild
    }

    // apply transition data to child
    // use getRealChild() to ignore abstract components e.g. keep-alive
    const child: ?VNode = getRealChild(rawChild) // 向下遍历，获取插槽内容的第一个节点的真正节点，即非抽象节点
    /* istanbul ignore if */
    if (!child) { // 无非抽象节点
      return rawChild
    }

    if (this._leaving) { // 离开过渡进行中
      return placeholder(h, rawChild) // 如果虚拟节点的标签是以-keep-alive结尾，则创建并返回对应的keep-alive节点
    }

    // ensure a key that is unique to the vnode type and to this transition
    // component instance. This key will be used to remove pending leaving nodes
    // during entering.
    const id: string = `__transition-${this._uid}-` // _uid是组件的实例编号
    child.key = child.key == null // 如果插槽内容第一个节点的实际节点没有key，则生成key，如果key是基础类型，则将id加入key中
      ? child.isComment // 注释节点
        ? id + 'comment'
        : id + child.tag
      : isPrimitive(child.key)
        ? (String(child.key).indexOf(id) === 0 ? child.key : id + child.key)
        : child.key

    const data: Object = (child.data || (child.data = {})).transition = extractTransitionData(this) // 获取当前组件的占位节点上的属性和事件。data是插槽内容的第一个节点的真正节点的数据对象
    const oldRawChild: VNode = this._vnode // 该组件的虚拟节点树
    const oldChild: VNode = getRealChild(oldRawChild) // 向下遍历，获取虚拟节点树根节点的真正节点

    // mark v-show
    // so that the transition module can hand over the control to the directive
    if (child.data.directives && child.data.directives.some(isVShowDirective)) { // 插槽内容的第一个节点的实际节点有v-show指令
      child.data.show = true // v-show指令置为true
    }

    if (
      oldChild && // 虚拟节点树的真正节点
      oldChild.data &&
      !isSameChild(child, oldChild) && // 插槽内容的第一个节点的真正节点，与虚拟节点树的真正节点不是同一个节点
      !isAsyncPlaceholder(oldChild) && // 虚拟节点树的真正节点不是某组件的异步占位节点
      // #6687 component root is a comment node
      !(oldChild.componentInstance && oldChild.componentInstance._vnode.isComment) // 虚拟节点树的真正节点作为占位节点的组件的根节点是注释节点 TODO：上边条件不是已经判断了不是占位节点了吗
    ) {
      // replace old child transition data with fresh one
      // important for dynamic transitions!
      const oldData: Object = oldChild.data.transition = extend({}, data) // 虚拟节点树的真正节点置绑定的属性和对象
      // handle transition mode
      if (mode === 'out-in') { // 过渡状态为先出后进
        // return placeholder node and queue update when leave finishes
        this._leaving = true // 离开过渡开始
        mergeVNodeHook(oldData, 'afterLeave', () => { // 合并虚拟节点树的真正节点的afterLeave钩子
          this._leaving = false // 离开过渡结束
          this.$forceUpdate() // 当前组件强制更新
        })
        return placeholder(h, rawChild) // 如果插槽第一个节点是以-keep-alive结尾，则返回keep-alive节点，否则返回undefined TODO：这里返回undefined？
      } else if (mode === 'in-out') { // 过渡状态为先进后出
        if (isAsyncPlaceholder(child)) { // 插槽内容第一个节点的真正节点是异步占位节点
          return oldRawChild // 返回当前组件的虚拟节点树
        }
        let delayedLeave
        const performLeave = () => { delayedLeave() } // 执行虚拟节点树的真正节点的离开过渡函数
        mergeVNodeHook(data, 'afterEnter', performLeave) // 合并afterEnter钩子到插槽内容的第一个节点的真正节点的属性和事件对象
        mergeVNodeHook(data, 'enterCancelled', performLeave) // 合并enterCancelled钩子到插槽内容的第一个节点的真正节点的属性和事件对象
        mergeVNodeHook(oldData, 'delayLeave', leave => { delayedLeave = leave }) // 合并delayLeave钩子（离开过渡延时钩子）到虚拟节点树的真正节点的绑定的属性和对象，leave函数用来实现离开过渡
      }
    }

    return rawChild // 插槽内容的第一个节点
  }
}
