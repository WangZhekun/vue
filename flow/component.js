import type { Config } from '../src/core/config'
import type VNode from '../src/core/vdom/vnode'
import type Watcher from '../src/core/observer/watcher'

declare interface Component {
  // constructor information
  static cid: number;
  static options: Object;
  // extend
  static extend: (options: Object) => Function;
  static superOptions: Object;
  static extendOptions: Object;
  static sealedOptions: Object;
  static super: Class<Component>;
  // assets
  static directive: (id: string, def?: Function | Object) => Function | Object | void;
  static component: (id: string, def?: Class<Component> | Object) => Class<Component>;
  static filter: (id: string, def?: Function) => Function | void;
  // functional context constructor
  static FunctionalRenderContext: Function;

  // public properties
  $el: any; // 挂载点 so that we can attach __vue__ to it
  $data: Object; // _data的代理，只读
  $props: Object; // _props的代理，只读
  $options: ComponentOptions; // Vue实例的完整配置项
  $parent: Component | void; // 父实例
  $root: Component; // 根Vue实例
  $children: Array<Component>; // 子实例列表
  $refs: { [key: string]: Component | Element | Array<Component | Element> | void }; // 引用
  $slots: { [key: string]: Array<VNode> }; // 插槽名到vnode列表（插槽内容）的映射
  $scopedSlots: { [key: string]: () => VNodeChildren }; // 标准化后的插槽内容。插槽名到可以获得插槽内容的虚拟节点列表的函数的映射
  $vnode: VNode; // 组件在父实例中的虚拟节点 the placeholder node for the component in parent's render tree
  $attrs: { [key: string] : string }; // 组件在父组件中的节点的特性集合，浅响应式
  $listeners: { [key: string]: Function | Array<Function> }; // 组件在父组件中的虚拟节点的事件监听
  $isServer: boolean; // 是否在服务端，只读

  // public methods
  $mount: (el?: Element | string, hydrating?: boolean) => Component;
  $forceUpdate: () => void;
  $destroy: () => void;
  $set: <T>(target: Object | Array<T>, key: string | number, val: T) => T;
  $delete: <T>(target: Object | Array<T>, key: string | number) => void;
  $watch: (expOrFn: string | Function, cb: Function, options?: Object) => Function;
  $on: (event: string | Array<string>, fn: Function) => Component; // 新增事件监听
  $once: (event: string, fn: Function) => Component; // 新增一次性事件监听
  $off: (event?: string | Array<string>, fn?: Function) => Component; // 取消事件监听
  $emit: (event: string, ...args: Array<mixed>) => Component; // 触发事件
  $nextTick: (fn: Function) => void | Promise<*>; // 注册时间片（下次 DOM 更新循环）结束的回调
  $createElement: (tag?: string | Component, data?: Object, children?: VNodeChildren) => VNode;

  // private properties
  _uid: number | string; // 实例编号
  _name: string; // this only exists in dev mode
  _isVue: true; // Vue实例标志
  _self: Component;
  _renderProxy: Component;
  _renderContext: ?Component;
  _watcher: Watcher; // 组件模板对应的Watcher实例
  _watchers: Array<Watcher>; // 组件实例的所有Watcher实例，包括_watcher
  _computedWatchers: { [key: string]: Watcher }; // 计算属性的属性名到对应的Watcher实例的映射
  _data: Object; // 响应式数据对象
  _props: Object; // 属性对象
  _events: Object; // 事件名到事件处理方法集合的映射
  _inactive: boolean | null;
  _directInactive: boolean;
  _isMounted: boolean;
  _isDestroyed: boolean; // 销毁完毕
  _isBeingDestroyed: boolean; // 已经开始执行销毁操作
  _vnode: ?VNode; // 该组件的虚拟节点树，self root node
  _staticTrees: ?Array<VNode>; // v-once cached trees
  _hasHookEvent: boolean; // 组件被监听的事件中包含以hook:开头的事件
  _provided: ?Object;
  // _virtualComponents?: { [key: string]: Component };

  // private methods

  // lifecycle
  _init: Function; // 实例初始化方法
  _mount: (el?: Element | void, hydrating?: boolean) => Component;
  _update: (vnode: VNode, hydrating?: boolean) => void;

  // rendering
  _render: () => VNode;

  __patch__: (
    a: Element | VNode | void,
    b: VNode,
    hydrating?: boolean,
    removeOnly?: boolean,
    parentElm?: any,
    refElm?: any
  ) => any;

  // createElement

  // _c is internal that accepts `normalizationType` optimization hint
  _c: (
    vnode?: VNode,
    data?: VNodeData,
    children?: VNodeChildren,
    normalizationType?: number
  ) => VNode | void; // 实例的createElement方法

  // renderStatic
  _m: (index: number, isInFor?: boolean) => VNode | VNodeChildren;
  // markOnce
  _o: (vnode: VNode | Array<VNode>, index: number, key: string) => VNode | VNodeChildren;
  // toString
  _s: (value: mixed) => string;
  // text to VNode
  _v: (value: string | number) => VNode;
  // toNumber
  _n: (value: string) => number | string;
  // empty vnode
  _e: () => VNode;
  // loose equal
  _q: (a: mixed, b: mixed) => boolean;
  // loose indexOf
  _i: (arr: Array<mixed>, val: mixed) => number;
  // resolveFilter
  _f: (id: string) => Function;
  // renderList
  _l: (val: mixed, render: Function) => ?Array<VNode>;
  // renderSlot
  _t: (name: string, fallback: ?Array<VNode>, props: ?Object) => ?Array<VNode>;
  // apply v-bind object
  _b: (data: any, tag: string, value: any, asProp: boolean, isSync?: boolean) => VNodeData;
  // apply v-on object
  _g: (data: any, value: any) => VNodeData;
  // check custom keyCode
  _k: (eventKeyCode: number, key: string, builtInAlias?: number | Array<number>, eventKeyName?: string) => ?boolean;
  // resolve scoped slots
  _u: (scopedSlots: ScopedSlotsData, res?: Object) => { [key: string]: Function };

  // SSR specific
  _ssrNode: Function;
  _ssrList: Function;
  _ssrEscape: Function;
  _ssrAttr: Function;
  _ssrAttrs: Function;
  _ssrDOMProps: Function;
  _ssrClass: Function;
  _ssrStyle: Function;

  // allow dynamic method registration
  [key: string]: any
};
