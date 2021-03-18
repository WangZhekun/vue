/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
// 组件的虚拟节点的钩子，在虚拟节点渲染时执行
const componentVNodeHooks = {
  /**
   * 初始化钩子
   * @param {VNodeWithData} vnode 虚拟节点
   * @param {boolean} hydrating 是否将DOM节点与vnode关联
   */
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance && // 虚拟节点作为组件的占位节点
      !vnode.componentInstance._isDestroyed && // 占位节点对应的组件实例没有被销毁
      vnode.data.keepAlive // 虚拟节点被缓存
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode) // 执行预渲染的钩子
    } else { // 非占位节点，或占位节点组件实例被销毁，或虚拟节点没有被缓存
      const child = vnode.componentInstance = createComponentInstanceForVnode( // 为占位节点创建对应的组件实例
        vnode,
        activeInstance
      )
      child.$mount(hydrating ? vnode.elm : undefined, hydrating) // 挂载
    }
  },

  /**
   * 预渲染钩子
   * @param {MountedComponentVNode} oldVnode 旧虚拟节点
   * @param {MountedComponentVNode} vnode 新虚拟节点
   */
  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions // 作为占位节点的对应组件的配置对象
    const child = vnode.componentInstance = oldVnode.componentInstance // 作为占位节点的对应组件的实例
    updateChildComponent( // 更新子组件实例
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  /**
   * 关联DOM与虚拟节点的钩子
   * @param {MountedComponentVNode} vnode 虚拟节点
   */
  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode // context是虚拟节点的渲染上下文，componentInstance为占位节点对应的组件的实例
    if (!componentInstance._isMounted) { // 子组件未挂载
      componentInstance._isMounted = true // 置挂载标志
      callHook(componentInstance, 'mounted') // 执行已挂载钩子
    }
    if (vnode.data.keepAlive) { // 虚拟节点已缓存
      if (context._isMounted) { // 虚拟节点的渲染上下文已挂载
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance) // 激活子组件实例，并加入到已激活列表中
      } else { // 虚拟节点的渲染上下文未挂载
        activateChildComponent(componentInstance, true /* direct */) // 激活keep-alive缓存的组件树，直接激活
      }
    }
  },

  /**
   * 销毁钩子
   * @param {MountedComponentVNode} vnode 虚拟节点
   */
  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode // 作为占位节点所对应的组件实例
    if (!componentInstance._isDestroyed) { // 子组件未挂载
      if (!vnode.data.keepAlive) { // 虚拟节点未缓存
        componentInstance.$destroy() // 销毁子组件实例
      } else {
        deactivateChildComponent(componentInstance, true /* direct */) // 使keep-alive缓存的组件树失活
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks) // 取待合并的钩子名称

/**
 * 创建组件的占位虚拟节点
 * @param {Class<Component> | Function | Object | void} Ctor 组件的构造函数或配置对象
 * @param {VNodeData} data 组件在父组件内的对应的虚拟节点的数据对象
 * @param {Component} context 组件在父组件内的对应的虚拟节点的渲染上下文
 * @param {Array<VNode>} children 子节点，即插槽内容
 * @param {string} tag 组件在父组件内的对应的节点的标签名
 */
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  const baseCtor = context.$options._base // 上下文的构造函数，即组件的父组件的构造函数

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) { // Ctor为组件的配置对象，则创建父组件构造函数的子类构造器
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  // 异步组件
  let asyncFactory
  if (isUndef(Ctor.cid)) { // 类ID未定义，即Ctor不是构造函数，而是构造函数的工厂函数
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor) // 处理异步工厂函数
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      // 创建空的占位虚拟节点
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 根据Ctor的父类（如果有）的全局配置，更新并获取全局配置
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  if (isDef(data.model)) { // 组件在父组件中的节点存在v-model
    transformModel(Ctor.options, data) // 转化v-model
  }

  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag) // 获取组件的属性的绑定对象

  // functional component
  if (isTrue(Ctor.options.functional)) { // 函数式组件
    return createFunctionalComponent(Ctor, propsData, data, context, children) // 创建函数式组件实例，返回渲染后的虚拟节点树
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn // TODO：为什么？

  if (isTrue(Ctor.options.abstract)) { // 抽象组件（如keep-alive，不渲染DOM，也不会出现在父组件链中）
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 合并虚拟节点的钩子
  installComponentHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag
  const vnode = new VNode( // 创建组件的占位节点
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

/**
 * 为占位节点创建对应的组件实例
 * @param {any} vnode 组件的占位节点
 * @param {any} parent 正在活跃的Vue实例
 */
export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode,
    parent
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate // 组件的内联模板
  if (isDef(inlineTemplate)) { // 取内联模板的render方法
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  return new vnode.componentOptions.Ctor(options) // 创建组件实例
}

/**
 * 合并组件的钩子
 * @param {VNodeData} data 虚拟节点的数据对象
 */
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {}) // 自定义钩子
  for (let i = 0; i < hooksToMerge.length; i++) { // 遍历默认钩子
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
/**
 * 转化组件在父组件中的节点的v-model为属性绑定和事件监听
 * @param {ComponentOptions} options 组件配置对象
 * @param {any} data 组件在父组件中对应的虚拟节点的数据对象
 */
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value' // 取配置对象中针对v-model转化的属性名，默认为value
  const event = (options.model && options.model.event) || 'input' // 取配置对象中针对v-model转化的事件名，默认为input
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value // 这个应该是v-model绑定的数据对象中的某个属性 TODO：不确定model.value是啥
  const on = data.on || (data.on = {})
  const existing = on[event] // 虚拟节点存在该事件监听
  const callback = data.model.callback // 这个应该是对v-model绑定的数据对象中的某个属性赋值的回调 TODO：不确定model.callback是啥
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) { // callback不在v-model对应的事件监听队列中
      on[event] = [callback].concat(existing) // 添加v-model对应的事件监听
    }
  } else {
    on[event] = callback // 添加v-model对应的事件监听
  }
}
