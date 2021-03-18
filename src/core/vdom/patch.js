/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, []) // 空虚拟节点，用于在执行钩子时

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

/**
 * a和b是否是相同的虚拟节点
 * @param {VNode} a 旧虚拟节点
 * @param {VNode} b 新虚拟节点
 */
function sameVnode (a, b) {
  return (
    a.key === b.key && (
      (
        a.tag === b.tag &&
        a.isComment === b.isComment &&
        isDef(a.data) === isDef(b.data) &&
        sameInputType(a, b)
      ) || (
        isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)
      )
    )
  )
}

/**
 * a和b是否是相同的虚拟Input节点
 * @param {VNode} a 虚拟节点
 * @param {VNode} b 虚拟节点
 */
function sameInputType (a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type
  const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type
  return typeA === typeB || isTextInputType(typeA) && isTextInputType(typeB)
}

/**
 * 获取children中指定范围内各元素的key到索引的映射
 * @param {Array<VNode>} children 旧的VNode的子节点列表
 * @param {number} beginIdx 起始索引
 * @param {number} endIdx 结束索引
 */
function createKeyToOldIdx (children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

/**
 * 获取创建、更新、删除VNode树的函数
 * @param {Object} backend 包含节点操作、基础模块和平台运行时模板的对象
 */
export function createPatchFunction (backend) {
  let i, j
  const cbs = {} // 钩子名称到执行方法列表的映射

  const {
    modules, // 基础模块和平台运行时模块，见platforms/web/runtime/patch.js
    nodeOps // 节点操作对象，见platforms/web/runtime/node-ops.js
  } = backend

  for (i = 0; i < hooks.length; ++i) { // 集合各模块的钩子 TODO：这里为何要集合所有模块的钩子，在下方组件发生变化时执行指定生命周期的所有钩子
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

  /**
   * 创建elm节点对应的VNode空实例
   * @param {Element} elm DOM节点
   */
  function emptyNodeAt (elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  /**
   * 获取将childElm从父节点删除的函数
   * @param {Node} childElm 节点
   * @param {number} listeners remove事件的监听数量
   */
  function createRmCb (childElm, listeners) {
    function remove () {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }

  /**
   * 将el从父节点中删除
   * @param {Node} el 节点
   */
  function removeNode (el) {
    const parent = nodeOps.parentNode(el) // 取el的父节点
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  /**
   * vnode是未知节点
   * @param {VNode} vnode 虚拟节点
   * @param {boolean} inVPre
   */
  function isUnknownElement (vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

  /**
   * 创建vnode树的elm树
   * @param {VNode} vnode 虚拟节点树
   * @param {Array<VNode>} insertedVnodeQueue
   * @param {Node} parentElm 虚拟节点的渲染结果的父节点
   * @param {Node} refElm 虚拟节点的渲染结果在父节点中的插入位置
   * @param {boolean} nested 虚拟节点是被嵌套的标志，即非根节点标志
   * @param {Array<VNode>} ownerArray vnode所在的数组
   * @param {number} index vnode在ownerArray中的索引
   */
  function createElm (
    vnode,
    insertedVnodeQueue,
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      vnode = ownerArray[index] = cloneVNode(vnode) // 浅复制虚拟节点
    }

    vnode.isRootInsert = !nested // for transition enter check
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) { // 创建虚拟节点所对应的组件实例。返回false，表示不是组件
      return
    }

    const data = vnode.data
    const children = vnode.children // 子节点
    const tag = vnode.tag // 虚拟节点对应的DOM节点
    if (isDef(tag)) { // 虚拟节点有对应的DOM节点
      if (process.env.NODE_ENV !== 'production') {
        if (data && data.pre) {
          creatingElmInVPre++
        }
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' + tag + '> - did you ' +
            'register the component correctly? For recursive components, ' +
            'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }

      vnode.elm = vnode.ns // 有命名空间
        ? nodeOps.createElementNS(vnode.ns, tag) // 创建具有命名空间的DOM节点
        : nodeOps.createElement(tag, vnode) // 创建DOM节点
      setScope(vnode) // 给虚拟节点的渲染结果添加插槽id的特性

      /* istanbul ignore if */
      if (__WEEX__) {
        // in Weex, the default insertion order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
        if (!appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
        createChildren(vnode, children, insertedVnodeQueue)
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
      } else {
        createChildren(vnode, children, insertedVnodeQueue) // 创建子节点的DOM节点
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue) // 执行create钩子
        }
        insert(parentElm, vnode.elm, refElm) // 将虚拟节点的渲染结果，插入到父节点的refElm的位置
      }

      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) { // 虚拟节点是注释节点
      vnode.elm = nodeOps.createComment(vnode.text) // 创建注释节点
      insert(parentElm, vnode.elm, refElm) // 插入注释节点
    } else {
      vnode.elm = nodeOps.createTextNode(vnode.text) // 创建文本节点
      insert(parentElm, vnode.elm, refElm) // 插入文本节点
    }
  }

  /**
   * 创建虚拟节点所对应的组件实例
   * @param {VNode} vnode 虚拟节点树
   * @param {Array<VNode>} insertedVnodeQueue vnode对应的组件的待插入队列，保存组件的根虚拟节点为组件的情况
   * @param {Node} parentElm vnode的渲染结果的父节点
   * @param {Node} refElm vnode的渲染结果要插入的位置（作为兄弟节点）
   */
  function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data // 虚拟节点的配置数据对象
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive // 虚拟节点所指代的组件实例存在，且缓存标志为true
      if (isDef(i = i.hook) && isDef(i = i.init)) { // 如果init钩子存在
        i(vnode, false /* hydrating */) // 执行组件的init钩子
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) { // 虚拟节点所指代的组件实例存在
        initComponent(vnode, insertedVnodeQueue) // 初始化组件实例
        insert(parentElm, vnode.elm, refElm) // 将虚拟节点的渲染结果插入到父节点的指定位置
        if (isTrue(isReactivated)) { // 恢复缓存的组件实例
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) // 重新激活vnode对应的组件
        }
        return true
      }
    }
  }

  /**
   * 初始化组件实例
   * @param {VNode} vnode 虚拟节点树
   * @param {Array<VNode>} insertedVnodeQueue vnode对应的组件的待插入队列，保存组件的根虚拟节点为组件的情况
   */
  function initComponent (vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) { // TODO: pendingInsert是啥？
      insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert)
      vnode.data.pendingInsert = null
    }
    vnode.elm = vnode.componentInstance.$el // 取组件的DOM树
    if (isPatchable(vnode)) { // vnode是否可更新，即vnode是非空节点
      invokeCreateHooks(vnode, insertedVnodeQueue) // 执行create钩子
      setScope(vnode) // 给vnode的渲染结果上添加插槽id的特性
    } else { // vnode是空节点
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode) // 注册引用
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode)
    }
  }

  /**
   * 重新激活vnode对应组件
   * @param {VNode} vnode 虚拟节点
   * @param {Array<VNode>} insertedVnodeQueue vnode对应的组件的待插入队列，保存组件的根虚拟节点为组件的情况
   * @param {Node} parentElm vnode的渲染结果的父节点
   * @param {Node} refElm vnode的渲染结果要插入的位置（作为兄弟节点）
   */
  function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode
    while (innerNode.componentInstance) { // 该节点是组件，遍历该节点下所有的根虚拟节点为组件的情况
      innerNode = innerNode.componentInstance._vnode // 取该节点对应组件的虚拟节点树
      if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
        for (i = 0; i < cbs.activate.length; ++i) { // 调用组件的激活钩子
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode) // 加入到待插入的虚拟节点队列中
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm) // 插入节点
  }

  /**
   * 将节点elm插入到父节点的指定位置
   * @param {Node} parent 父节点（虚拟节点渲染出的结果）
   * @param {Node} elm 待插入的子节点（虚拟节点渲染出的结果）
   * @param {Node} ref 插入位置的兄弟节点
   */
  function insert (parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref) // 将子节点插入到兄弟节点ref的前面
        }
      } else {
        nodeOps.appendChild(parent, elm) // 将子节点插入到父节点中
      }
    }
  }

  /**
   * 创建子节点的DOM节点
   * @param {VNode} vnode 虚拟节点树
   * @param {Array<VNode>}} children 虚拟节点的子节点
   * @param {Array<VNode>} insertedVnodeQueue
   */
  function createChildren (vnode, children, insertedVnodeQueue) {
    if (Array.isArray(children)) { // 子节点是列表
      if (process.env.NODE_ENV !== 'production') {
        checkDuplicateKeys(children)
      }
      for (let i = 0; i < children.length; ++i) {
        createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i) // 创建子节点树对应的DOM节点树
      }
    } else if (isPrimitive(vnode.text)) { // 文本是基础值
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text))) // 创建文本节点，并插入到vnode渲染结果的子节点列表中
    }
  }

  /**
   * vnode是否可更新 —— vnode所在的组件的根虚拟节点有对应的DOM节点
   * @param {VNode} vnode 虚拟节点
   */
  function isPatchable (vnode) {
    while (vnode.componentInstance) { // 取vnode所在组件实例的根VNode节点
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag) // 虚拟节点（包括子组件的所有根虚拟节点）有对应的DOM节点
  }

  /**
   * 执行create钩子
   * @param {VNode} vnode 虚拟节点树
   * @param {Array<VNode>} insertedVnodeQueue
   */
  function invokeCreateHooks (vnode, insertedVnodeQueue) {
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode) // 执行create钩子
    }
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) {
      if (isDef(i.create)) i.create(emptyNode, vnode) // 执行vnode的create钩子
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  /**
   * 给vnode的渲染结果添加插槽id特性
   * @param {VNode} vnode 虚拟节点树
   */
  function setScope (vnode) {
    let i
    if (isDef(i = vnode.fnScopeId)) {
      nodeOps.setStyleScope(vnode.elm, i) // 在虚拟节点的渲染结果上创建插槽id对应的特性
    } else {
      let ancestor = vnode // 祖先虚拟节点
      while (ancestor) { // 循环遍历组件节点
        if (isDef(i = ancestor.context) && isDef(i = i.$options._scopeId)) { // 祖先虚拟节点的上下文（所属的Vue实例）的插槽id，如果存在
          nodeOps.setStyleScope(vnode.elm, i) // 在虚拟节点的渲染结果上创建插槽id对应的特性
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (isDef(i = activeInstance) && // 当前活跃的Vue实例
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef(i = i.$options._scopeId)
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  /**
   * 创建vnodes列表中startIdx到endIdx之间的虚拟节点树的DOM树
   * @param {Node} parentElm vnodes的父节点
   * @param {Node} refElm vnodes在父节点中的插入位置
   * @param {Array<VNode>} vnodes 子节点列表
   * @param {number} startIdx 需要创建DOM树的虚拟节点的起始索引
   * @param {number} endIdx 需要创建DOM树的虚拟节点的结束索引
   * @param {Array<VNode>} insertedVnodeQueue
   */
  function addVnodes (parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx)
    }
  }

  /**
   * 执行vnode树的destory钩子（节点本身的和各模块的）
   * @param {VNode} vnode 虚拟节点
   */
  function invokeDestroyHook (vnode) {
    let i, j
    const data = vnode.data
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode) // 执行vnode的destory钩子
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode) // 执行各模块的destory钩子
    }
    if (isDef(i = vnode.children)) { // 各子节点递归执行destory钩子
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  /**
   * 删除指定索引范围的虚拟节点
   * @param {Array<VNode>} vnodes 虚拟节点列表
   * @param {number} startIdx 待删除节点的起始索引
   * @param {number} endIdx 待删除节点的结束索引
   */
  function removeVnodes (vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (isDef(ch)) {
        if (isDef(ch.tag)) { // vnode存在对应的DOM节点
          removeAndInvokeRemoveHook(ch) // 将ch.elm从其父节点中删除，并执行remove钩子
          invokeDestroyHook(ch) // 执行ch树的destory钩子
        } else { // Text node
          removeNode(ch.elm) // 将ch.elm从其父节点中删除
        }
      }
    }
  }

  /**
   * 将vnode.elm从其父节点中删除，并执行remove钩子 TODO: 缺少递归部分的说明
   * @param {VNode} vnode 虚拟节点
   * @param {Function} rm 将vnode.elm从其父节点删除的回调函数
   */
  function removeAndInvokeRemoveHook (vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1 // remove钩子的执行函数的数量 —— remove事件的监听数量，因为在rm中是先--，再判0的，所以需要先+1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners // 更新remove事件的监听数量
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners) // 获取将vnode.elm从其父节点删除的方法
      }
      // recursively invoke hooks on child component root node
      // 在子组件的根节点上，递归调用remove钩子 TODO：情况不明
      if (isDef(i = vnode.componentInstance) && isDef(i = i._vnode) && isDef(i.data)) {
        removeAndInvokeRemoveHook(i, rm)
      }
      for (i = 0; i < cbs.remove.length; ++i) { // 调用remove钩子
        cbs.remove[i](vnode, rm)
      }
      if (isDef(i = vnode.data.hook) && isDef(i = i.remove)) { // TODO：情况不明
        i(vnode, rm)
      } else {
        rm() // 将vnode.elm从其父节点中删除，并更新remove事件的监听数量
      }
    } else { // rm 和 vnode.data都没定义  TODO：这意味着什么
      removeNode(vnode.elm) // 将vnode.elm从其父节点中删除
    }
  }

  /**
   * 更新子节点
   * @param {Node} parentElm 父DOM节点
   * @param {Array<VNode>} oldCh 旧子节点
   * @param {Array<VNode>} newCh 新子节点
   * @param {Array<VNode>} insertedVnodeQueue
   * @param {boolean} removeOnly 旧子节点的删除标志，当为false时，旧子节点会根据新子节点排序 TODO: 然而有什么用呢？
   */
  function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly // TODO：不太明白removeOnly的含义

    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(newCh)
    }

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) { // 遍历旧子节点列表和新子节点列表，任何一个遍历完即停止
      if (isUndef(oldStartVnode)) { // 第一个旧子节点未定义
        oldStartVnode = oldCh[++oldStartIdx] // 取下一个起始旧子节点，Vnode has been moved left
      } else if (isUndef(oldEndVnode)) { // 最后一个旧子节点未定义
        oldEndVnode = oldCh[--oldEndIdx] // 取上一个结尾旧子节点
      } else if (sameVnode(oldStartVnode, newStartVnode)) { // 第一个旧子节点和第一个新子节点相同
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx) // 重新渲染第一个新子节点
        oldStartVnode = oldCh[++oldStartIdx] // 取下一个起始旧子节点
        newStartVnode = newCh[++newStartIdx] // 取下一个起始新子节点
      } else if (sameVnode(oldEndVnode, newEndVnode)) { // 最后一个旧子节点和最后一个新子节点相同
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx) // 重新渲染最后一个新子节点
        oldEndVnode = oldCh[--oldEndIdx] // 取上一个结尾旧子节点
        newEndVnode = newCh[--newEndIdx] // 取上一个结尾新子节点
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // 第一个旧子节点与最后一个新子节点相同，即第一个旧子节点之后的所有节点删除。Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx) // 重新渲染最后一个新子节点
        canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm)) // 如果不删除，将第一个旧子节点的DOM插入到最后一个旧子节点的下一个兄弟节点之前
        oldStartVnode = oldCh[++oldStartIdx] // 取下一个起始旧子节点
        newEndVnode = newCh[--newEndIdx] // 取上一个结尾新子节点
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // 最后一个旧子节点与第一个新子节点相同，即最后一个旧子节点前的所有节点删除。Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx) // 重新渲染第一个新子节点
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm) // 如果不删除，将最后一个旧子节点的DOM插入到第一个新子节点的DOM之前 TODO：这里为什么要插入
        oldEndVnode = oldCh[--oldEndIdx] // 取上一个结尾旧子节点
        newStartVnode = newCh[++newStartIdx] // 取下一个起始新子节点
      } else { // 其他混合情况 —— 边界的新旧两对节点没有相同的
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx) // 获取children的key到索引的映射
        idxInOld = isDef(newStartVnode.key) // 起始新节点有key属性
          ? oldKeyToIdx[newStartVnode.key] // 取key属性对应的旧节点
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx) // 在旧节点列表中找到与node相同的节点，返回其索引
        if (isUndef(idxInOld)) { // 在旧子节点中没找到，即该节点是新节点。New element
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx) // 创建起始新子节点的DOM树
        } else { // 找到了
          vnodeToMove = oldCh[idxInOld]
          if (sameVnode(vnodeToMove, newStartVnode)) { // 新旧节点是相同节点
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx) // 重新渲染起始新子节点
            oldCh[idxInOld] = undefined // 将节点从旧子节点中删除
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm) // 如果不删除，将起始新子节点对应的旧节点的DOM插入到起始旧子节点的DOM之前，因为起始旧子节点是旧子节点需要保留的节点的后一个
          } else { // 新旧节点不是相同节点
            // same key but different element. treat as new element
            createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx) // 创建起始新子节点的DOM树
          }
        }
        newStartVnode = newCh[++newStartIdx] // 取下一个起始新子节点
      }
    }
    if (oldStartIdx > oldEndIdx) { // 新子节点列表未遍历完
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm // 如果结尾新子节点为最后一个子节点，则插入位置为null，否则为结尾新子节点的后一个
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue) // 将新子节点中从newStartIdx到newEndIdx的节点的DOM树插入到父节点的refElm位置之前
    } else if (newStartIdx > newEndIdx) { // 旧子节点列表未遍历完
      removeVnodes(oldCh, oldStartIdx, oldEndIdx) // 删除旧子节点oldStartIdx到oldEndIdx的索引
    }
  }

  function checkDuplicateKeys (children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }

  /**
   * 在旧节点列表中找到与node相同的节点，返回其索引
   * @param {VNode} node 虚拟节点
   * @param {Array<VNode>} oldCh 旧节点列表
   * @param {number} start 旧节点列表的查询起始索引
   * @param {number} end 旧节点列表的查询结束索引（不包含）
   */
  function findIdxInOld (node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  /**
   * 重新渲染虚拟节点
   * @param {VNode} oldVnode 旧虚拟节点树
   * @param {VNode} vnode 新虚拟节点树
   * @param {Array<VNode>} insertedVnodeQueue
   * @param {Array<VNode>} ownerArray 新虚拟节点树所在的数组
   * @param {number} index 新虚拟节点树在数组中的索引
   * @param {boolean} removeOnly 更新子节点时用。旧子节点的删除标志，当为false时，旧子节点会根据新子节点排序
   */
  function patchVnode (
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly
  ) {
    if (oldVnode === vnode) { // 新旧虚拟节点树相同
      return
    }

    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode) // 浅复制虚拟节点树
    }

    const elm = vnode.elm = oldVnode.elm // 将旧虚拟节点树的渲染结果同步到新虚拟节点树上

    if (isTrue(oldVnode.isAsyncPlaceholder)) { // 旧虚拟节点是异步占位节点，即是注释节点，且有异步组件工厂函数
      if (isDef(vnode.asyncFactory.resolved)) { // 异步工厂函数已经执行完毕
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue) // 将旧虚拟节点的渲染结果与新虚拟节点关联
      } else {
        vnode.isAsyncPlaceholder = true // 异步工厂函数没有执行结束，则置标志
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    // 新旧虚拟节点都是静态节点，并且key相同
    // 静态节点不需要重新渲染
    if (isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
      i(oldVnode, vnode) // 执行新虚拟节点的prepatch钩子
    }

    const oldCh = oldVnode.children // 旧虚拟节点的子节点
    const ch = vnode.children // 新虚拟节点的子节点
    if (isDef(data) && isPatchable(vnode)) { // 新虚拟节点是可更新的，即有对应的DOM节点
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode) // 执行update钩子
      if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode) // 执行update钩子
    }
    if (isUndef(vnode.text)) { // 新虚拟节点的不是文本节点
      if (isDef(oldCh) && isDef(ch)) { // 新旧虚拟节点的子节点存在
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly) // 更新子节点
      } else if (isDef(ch)) { // 新虚拟节点的子节点存在，旧的不存在
        if (process.env.NODE_ENV !== 'production') {
          checkDuplicateKeys(ch)
        }
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '') // 清空DOM节点的textContent属性
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue) // 创建新虚拟节点的子节点的DOM树
      } else if (isDef(oldCh)) { // 旧虚拟节点的子节点存在，新的不存在
        removeVnodes(oldCh, 0, oldCh.length - 1) // 删除旧虚拟节点的子节点
      } else if (isDef(oldVnode.text)) { // 旧虚拟节点是文本节点
        nodeOps.setTextContent(elm, '') // 清空DOM节点的textContent属性
      }
    } else if (oldVnode.text !== vnode.text) { // 新虚拟节点是文本节点，新旧虚拟节点的文本不相同
      nodeOps.setTextContent(elm, vnode.text) // 设置DOM节点的textContent属性
    }
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode) // 执行postpatch钩子，重新渲染完毕
    }
  }

  /**
   * 执行insert钩子
   * @param {VNode} vnode 虚拟节点
   * @param {Array<VNode>} queue
   * @param {boolean} initial 初始化标志
   */
  function invokeInsertHook (vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue
    } else {
      for (let i = 0; i < queue.length; ++i) {
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  /**
   * 将DOM节点与VNode关联
   * 该函数是浏览器端函数
   * @param {Node} elm DOM节点树
   * @param {VNode} vnode 待关联的虚拟节点
   * @param {Array<VNode>} insertedVnodeQueue
   * @param {boolean} inVPre 跳过这个元素和它的子元素的编译过程标志
   */
  function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre) // 跳过这个元素和它的子元素的编译过程标志
    vnode.elm = elm // 将DOM节点添加到虚拟节点中

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) { // vnode是注释节点，且有异步组件工厂函数
      vnode.isAsyncPlaceholder = true // 置异步占位标志为true
      return true
    }
    // assert node match
    if (process.env.NODE_ENV !== 'production') {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) { // 虚拟节点的数据对象存在
      if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode, true /* hydrating */) // 调用初始化钩子
      if (isDef(i = vnode.componentInstance)) { // 虚拟节点是组件
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue) // 初始化组件实例
        return true
      }
    }
    if (isDef(tag)) { // 虚拟节点的DOM标签名
      if (isDef(children)) { // 子节点存在
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) { // DOM节点没有子节点
          createChildren(vnode, children, insertedVnodeQueue) // 创建虚拟节点子节点的DOM树
        } else { // DOM节点有子节点
          // v-html and domProps: innerHTML
          if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) { // 取虚拟节点的数据对象中的domProps配置的innerHTML属性
            if (i !== elm.innerHTML) { // 虚拟节点的innerHTML配置与DOM节点的innerHTML不同
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false // 关联失败
            }
          } else { // 无法取到虚拟节点的数据对象中的domProps配置的innerHTML属性
            // iterate and compare children lists
            let childrenMatch = true // 子节点匹配标志
            let childNode = elm.firstChild // 取DOM节点的第一个子节点
            for (let i = 0; i < children.length; i++) { // 遍历虚拟节点的子节点
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) { // 关联子虚拟节点与对应索引的子DOM节点
                childrenMatch = false // 关联失败，置子节点匹配标志
                break
              }
              childNode = childNode.nextSibling // 取下一个子节点
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) { // 子节点匹配失败，或DOM节点的子节点有多余节点
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
              }
              return false // 关联失败
            }
          }
        }
      }
      if (isDef(data)) { // 虚拟节点的数据对象存在
        let fullInvoke = false
        for (const key in data) { // 遍历虚拟节点的数据对象中的属性
          if (!isRenderedModule(key)) { // 属性不是attrs,class,staticClass,staticStyle,key其中之一
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue) // 执行create钩子
            break
          }
        }
        if (!fullInvoke && data['class']) { // 如果虚拟节点的数据对象中，不包含attrs,class,staticClass,staticStyle,key之外的属性，且class属性值存在
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class']) // 收集class深度绑定的依赖
        }
      }
    } else if (elm.data !== vnode.text) { // 虚拟节点无对应的DOM标签，是文本节点。 TODO：DOM节点的data属性是什么
      elm.data = vnode.text
    }
    return true
  }

  function assertNodeMatch (node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return vnode.tag.indexOf('vue-component') === 0 || (
        !isUnknownElement(vnode, inVPre) &&
        vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  /**
   * 创建、更新、删除VNode树
   * @param {VNode | Element} oldVnode 旧VNode节点树，或DOM节点
   * @param {VNode} vnode 新VNode节点树，组件的根节点
   * @param {boolean} hydrating 是否将DOM节点与vnode关联
   * @param {boolean} removeOnly 更新子节点时用。旧子节点的删除标志，当为false时，旧子节点会根据新子节点排序
   */
  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    if (isUndef(vnode)) { // vnode未定义，即删除节点
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode) // 执行oldVnode的destory钩子
      return
    }

    let isInitialPatch = false //是否初始化
    const insertedVnodeQueue = []

    if (isUndef(oldVnode)) { // oldVnode未定义，即新增节点
      // empty mount (likely as component), create new root element
      isInitialPatch = true // 置初始化标志
      createElm(vnode, insertedVnodeQueue) // 创建vnode树的DOM树
    } else { // 更新节点
      const isRealElement = isDef(oldVnode.nodeType) // oldVnode是否是DOM节点
      if (!isRealElement && sameVnode(oldVnode, vnode)) { // oldVnode不是DOM节点，oldVnode与vnode相同
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly) // 重新渲染新虚拟节点
      } else { // oldVnode不是VNode节点，或oldVnode与vnode不相同
        // 这里之所以将“oldVnode不是VNode节点”，“oldVnode与vnode不相同”这两个条件放到一起，是因为这两个条件的处理方式都是重新渲染vnode
        if (isRealElement) { // oldVnode是DOM节点
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) { // nodeType为1表示元素节点，且有data-server-rendered特性，即是服务端渲染的
            oldVnode.removeAttribute(SSR_ATTR) // 移除data-server-rendered特性
            hydrating = true // 置待关联标志
          }
          if (isTrue(hydrating)) { // 需要关联
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) { // 将DOM节点与vnode关联
              invokeInsertHook(vnode, insertedVnodeQueue, true) // 执行insert钩子
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          oldVnode = emptyNodeAt(oldVnode) // 创建oldVnode DOM节点对应的空VNode节点
        }

        // replacing existing element
        const oldElm = oldVnode.elm // 旧DOM
        const parentElm = nodeOps.parentNode(oldElm) // 旧DOM的父节点

        // create new node
        // 创新VNode节点树的DOM树
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        // 虚拟节点有parent属性，即说明虚拟节点为组件的根节点，循环祖先节点，是找到全部的子组件作为父组件的唯一节点的情况
        if (isDef(vnode.parent)) { // 新VNode节点存在父节点，即组件在父实例中有占位节点
          let ancestor = vnode.parent // 新VNode节点的祖先节点
          const patchable = isPatchable(vnode) // vnode可更新
          while (ancestor) { // 遍历祖先节点，是因为可能存在多层抽象组件（或父组件模板中只有一个子组件）嵌套的情况
            for (let i = 0; i < cbs.destroy.length; ++i) { // 执行新VNode节点的父节点的destory钩子
              cbs.destroy[i](ancestor)
            }
            ancestor.elm = vnode.elm // TODO：为什么要修改父节点的DOM  答：将组件的渲染结果赋值给，组件在父组件中占位节点的VNode的elm
            if (patchable) { // vnode可更新
              for (let i = 0; i < cbs.create.length; ++i) { // 执行新VNode节点的父节点的create钩子
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              // 执行新VNode节点的父节点insert钩子
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else { // vnode不可更新
              registerRef(ancestor) // 引用注册
            }
            ancestor = ancestor.parent // 取父节点
          }
        }

        // 销毁旧虚拟节点。destroy old node
        if (isDef(parentElm)) { // 父节点存在
          removeVnodes([oldVnode], 0, 0) // 删除旧节点
        } else if (isDef(oldVnode.tag)) { // 旧节点有对应的DOM标签
          invokeDestroyHook(oldVnode) // 执行旧节点的destory钩子
        }
      }
    }

    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch) // 执行insert钩子
    return vnode.elm
  }
}
