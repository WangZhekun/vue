/* @flow */

import { emptyNode } from 'core/vdom/patch'
import { resolveAsset, handleError } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'

export default {
  create: updateDirectives, // 新增、更新、删除指令
  update: updateDirectives, // 新增、更新、删除指令
  destroy: function unbindDirectives (vnode: VNodeWithData) {
    updateDirectives(vnode, emptyNode) // 删除指令
  }
}

/**
 * 新增、更新、删除指令
 * @param {VNode} oldVnode 旧虚拟节点
 * @param {VNode} vnode 新虚拟节点
 */
function updateDirectives (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (oldVnode.data.directives || vnode.data.directives) { // 新旧虚拟节点任何一个的指令存在
    _update(oldVnode, vnode)
  }
}

/**
 * 新增、更新、删除指令
 * @param {VNode} oldVnode 旧虚拟节点
 * @param {VNode} vnode 新虚拟节点
 */
function _update (oldVnode, vnode) {
  const isCreate = oldVnode === emptyNode // 旧虚拟节点为空节点，即新增
  const isDestroy = vnode === emptyNode // 新虚拟节点为空节点，即删除
  const oldDirs = normalizeDirectives(oldVnode.data.directives, oldVnode.context) // 获得旧虚拟节点的指令名到指令对象的映射，对指令对象做了标准化处理
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context) // 获得新虚拟节点的指令名到指令对象的映射，对指令对象做了标准化处理

  const dirsWithInsert = [] // 待插入指令列表
  const dirsWithPostpatch = [] // 待重新渲染指令列表

  let key, oldDir, dir
  for (key in newDirs) { // 遍历新虚拟节点的指令
    oldDir = oldDirs[key] // 旧指令对象
    dir = newDirs[key] // 新指令对象
    if (!oldDir) { // 旧指令不存在
      // new directive, bind
      callHook(dir, 'bind', vnode, oldVnode) // 执行指令的bind钩子
      if (dir.def && dir.def.inserted) { // 指令定义对象的inserted钩子存在
        dirsWithInsert.push(dir) // 将该指令加入到待插入指令列表
      }
    } else { // 旧指令存在
      // existing directive, update
      dir.oldValue = oldDir.value // 旧指令的值
      dir.oldArg = oldDir.arg // 旧指令的参数
      callHook(dir, 'update', vnode, oldVnode) // 执行指令的update钩子，该钩子在所在组件的 VNode 更新时调用，但是可能发生在其子 VNode 更新之前
      if (dir.def && dir.def.componentUpdated) { // 指令定义对象中有componentUpdated钩子，该钩子在指令所在组件的 VNode 及其子 VNode 全部更新后调用
        dirsWithPostpatch.push(dir) // 将该指令插入到待重新渲染指令列表
      }
    }
  }

  if (dirsWithInsert.length) { // 待插入指令列表
    const callInsert = () => {
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], 'inserted', vnode, oldVnode) // 执行指令的inserted钩子，该钩子在被绑定元素插入父节点时调用 (仅保证父节点存在，但不一定已被插入文档中)
      }
    }
    if (isCreate) { // 新增
      mergeVNodeHook(vnode, 'insert', callInsert)
    } else { // 修改
      callInsert() // 执行待插入指令的inserted钩子
    }
  }

  if (dirsWithPostpatch.length) { // 待重新渲染指令列表
    mergeVNodeHook(vnode, 'postpatch', () => { // 该钩子是在重新渲染虚拟节点时执行
      for (let i = 0; i < dirsWithPostpatch.length; i++) { // 遍历待重新渲染指令列表
        callHook(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode) // 执行指令的componentUpdated钩子，该钩子在指令所在组件的 VNode 及其子 VNode 全部更新后调用。
      }
    }) // 合并指令和虚拟节点的postpatch钩子
  }

  if (!isCreate) { // 修改
    for (key in oldDirs) { // 遍历旧指令
      if (!newDirs[key]) { // 新指令列表中不存在该指令
        // no longer present, unbind
        callHook(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy) // 执行旧指令的unbind钩子，在指令与元素解绑时调用
      }
    }
  }
}

const emptyModifiers = Object.create(null)

/**
 * 获得指令名到指令对象的映射，对指令对象做了标准化处理
 * @param {Array<VNodeDirective>} dirs 虚拟节点的指令配置（数据对象的directives属性值）
 * @param {Component} vm 虚拟节点所在的Vue实例
 */
function normalizeDirectives (
  dirs: ?Array<VNodeDirective>,
  vm: Component
): { [key: string]: VNodeDirective } {
  const res = Object.create(null)
  if (!dirs) {
    // $flow-disable-line
    return res
  }
  let i, dir
  for (i = 0; i < dirs.length; i++) { // 遍历指令
    dir = dirs[i]
    if (!dir.modifiers) { // 指令无修饰符
      // $flow-disable-line
      dir.modifiers = emptyModifiers
    }
    res[getRawDirName(dir)] = dir // 添加指令名称到指令对象的映射
    dir.def = resolveAsset(vm.$options, 'directives', dir.name, true) // 在虚拟节点所在的Vue实例的配置中获取指令定义对象
  }
  // $flow-disable-line
  return res
}

/**
 * 获取指令的原始名称或格式化的名称（名称.修饰符.修饰符）
 * @param {VNodeDirective} dir 指令
 */
function getRawDirName (dir: VNodeDirective): string {
  return dir.rawName || `${dir.name}.${Object.keys(dir.modifiers || {}).join('.')}` // rawName表示指令原始名
}

/**
 * 执行指令的钩子
 * @param {VNodeDirective} dir 指令对象
 * @param {string} hook 需要执行的钩子名称
 * @param {VNode} vnode 指令所属的虚拟节点
 * @param {VNode} oldVnode 旧虚拟节点
 * @param {boolean} isDestroy 删除标志
 */
function callHook (dir, hook, vnode, oldVnode, isDestroy) {
  const fn = dir.def && dir.def[hook] // 获取指令定义对象中的hook钩子
  if (fn) {
    try {
      fn(vnode.elm, dir, vnode, oldVnode, isDestroy) // 执行该钩子，传入指令所属的虚拟节点的DOM节点，指令对象，指令所属的虚拟节点，指令所属的旧虚拟节点，删除标志
    } catch (e) {
      handleError(e, vnode.context, `directive ${dir.name} ${hook} hook`)
    }
  }
}
