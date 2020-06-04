/* @flow */

/**
 * Runtime helper for rendering static trees.
 */
/**
 * 执行静态render函数，创建静态虚拟节点
 * @param {number} index
 * @param {boolean} isInFor
 */
export function renderStatic (
  index: number,
  isInFor: boolean
): VNode | Array<VNode> {
  const cached = this._staticTrees || (this._staticTrees = []) // v-once缓存的静态虚拟节点
  let tree = cached[index]
  // if has already-rendered static tree and not inside v-for,
  // we can reuse the same tree.
  if (tree && !isInFor) { // 有缓存，且不是在v-for中，可以复用缓存
    return tree
  }
  // otherwise, render a fresh tree.
  tree = cached[index] = this.$options.staticRenderFns[index].call( // 执行静态render函数
    this._renderProxy,
    null,
    this // for render fns generated for functional component templates
  )
  markStatic(tree, `__static__${index}`, false) // 给非一次性虚拟节点设置静态节点相关属性
  return tree
}

/**
 * Runtime helper for v-once.
 * Effectively it means marking the node as static with a unique key.
 */
/**
 * 设置一次性（v-once）虚拟节点设置相关静态属性
 * @param {VNode | Array<VNode>} tree 虚拟节点
 * @param {number} index
 * @param {string} key 虚拟节点的key
 */
export function markOnce (
  tree: VNode | Array<VNode>,
  index: number,
  key: string
) {
  markStatic(tree, `__once__${index}${key ? `_${key}` : ``}`, true) // 给v-once虚拟节点设置静态节点相关属性，
  return tree
}

/**
 * 给虚拟节点设置静态节点相关属性
 * @param {VNode | Array<VNode>} tree 虚拟节点
 * @param {string} key 虚拟节点的key
 * @param {boolean} isOnce 是v-once节点，即一次性渲染节点
 */
function markStatic (
  tree: VNode | Array<VNode>,
  key: string,
  isOnce: boolean
) {
  if (Array.isArray(tree)) {
    for (let i = 0; i < tree.length; i++) { // 遍历虚拟节点列表
      if (tree[i] && typeof tree[i] !== 'string') { // 元素存在，且不是字符串
        markStaticNode(tree[i], `${key}_${i}`, isOnce) // 给虚拟节点设置静态节点相关属性
      }
    }
  } else {
    markStaticNode(tree, key, isOnce) // 给虚拟节点设置静态节点相关属性
  }
}

/**
 * 给虚拟节点设置静态节点相关属性
 * @param {VNode} node 目标虚拟节点
 * @param {string} key 虚拟节点的key
 * @param {boolean} isOnce 是v-once节点，即一次性渲染节点
 */
function markStaticNode (node, key, isOnce) {
  node.isStatic = true
  node.key = key
  node.isOnce = isOnce
}
