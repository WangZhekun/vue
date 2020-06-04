/* @flow */

export default class VNode {
  tag: string | void; // 标签名
  data: VNodeData | void; // 虚拟节点的配置数据对象
  children: ?Array<VNode>; // 子节点
  text: string | void; // 该虚拟节点为文本节点，该属性为文本内容
  elm: Node | void; // 虚拟节点渲染出的节点树
  ns: string | void; // 命名空间
  context: Component | void; // 当前虚拟节点渲染的上下文（Vue实例） rendered in this component's scope
  key: string | number | void;
  componentOptions: VNodeComponentOptions | void; // 虚拟节点（占位节点）的对应组件的配置项， { Ctor 组件构造器, propsData 属性绑定对象, listeners 事件监听, tag 占位节点名称, children 占位节点的子节点 }
  componentInstance: Component | void; // 虚拟节点对应的组件实例（占位节点，不是虚拟节点所在的组件的实例），component instance
  parent: VNode | void; // component placeholder node 组件在父实例中的虚拟节点

  // strictly internal
  raw: boolean; // contains raw HTML? (server only)
  isStatic: boolean; // hoisted static node
  isRootInsert: boolean; // 虚拟节点是组件根节点的标志，是进入过渡状态的判断依据。necessary for enter transition check
  isComment: boolean; // 是注释节点 empty comment placeholder?
  isCloned: boolean; // 是复制的节点 is a cloned node?
  isOnce: boolean; // 是v-once节点，即一次性渲染节点 is a v-once node?
  asyncFactory: Function | void; // 异步组件构造函数的工厂函数 async component factory function
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean; // 异步占位节点，即是注释节点，且有异步组件工厂函数
  ssrContext: Object | void;
  fnContext: Component | void; // real context vm for functional nodes
  fnOptions: ?ComponentOptions; // for SSR caching
  devtoolsMeta: ?Object; // used to store functional render context for devtools
  fnScopeId: ?string; // functional scope id support

  /**
   *
   * @param {string} tag 标签名
   * @param {VNodeData} data 虚拟节点的配置数据对象
   * @param {Array<VNode>} children 子节点
   * @param {string} text 文本
   * @param {Node} elm 虚拟节点渲染出的节点树
   * @param {Component} context 虚拟节点的渲染上下文（Vue实例）
   * @param {VNodeComponentOptions} componentOptions 虚拟节点（占位节点）的对应组件的配置项
   * @param {Function} asyncFactory 异步组件构造函数的工厂函数
   */
  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    this.tag = tag
    this.data = data
    this.children = children
    this.text = text
    this.elm = elm
    this.ns = undefined
    this.context = context
    this.fnContext = undefined
    this.fnOptions = undefined
    this.fnScopeId = undefined
    this.key = data && data.key
    this.componentOptions = componentOptions
    this.componentInstance = undefined
    this.parent = undefined
    this.raw = false
    this.isStatic = false
    this.isRootInsert = true
    this.isComment = false
    this.isCloned = false
    this.isOnce = false
    this.asyncFactory = asyncFactory
    this.asyncMeta = undefined
    this.isAsyncPlaceholder = false
  }

  // DEPRECATED: alias for componentInstance for backwards compat.
  /* istanbul ignore next */
  get child (): Component | void {
    return this.componentInstance
  }
}

/**
 * 创建注释节点
 * @param {string} text 节点内容，默认为空
 */
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode()
  node.text = text
  node.isComment = true
  return node
}

/**
 * 创建文本虚拟节点
 * @param {string | number} val 节点内容
 */
export function createTextVNode (val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
/**
 * 复制虚拟节点，不做深复制
 * @param {VNode} vnode 待复制虚拟节点
 */
export function cloneVNode (vnode: VNode): VNode {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    // #7975
    // clone children array to avoid mutating original in case of cloning
    // a child.
    vnode.children && vnode.children.slice(),
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
