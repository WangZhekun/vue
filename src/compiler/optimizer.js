/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey // ASTElement的静态属性到布尔值（默认为true）的Map
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys) // 生成genStaticKeys的执行结果的缓存函数

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
/**
 * 标记root树的static和staticInFor属性，即其他static相关全局变量
 * @param {ASTElement} root ASTElement树
 * @param {CompilerOptions} options 编译配置
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '') // 生成ASTElement的静态属性到true的Map
  isPlatformReservedTag = options.isReservedTag || no // 函数：标签在平台上是否是原生的
  // first pass: mark all non-static nodes.
  markStatic(root) // 标记root数的static属性
  // second pass: mark static roots.
  markStaticRoots(root, false) // 标记root树的staticInFor属性
}

/**
 * 生成指定key到true的Map
 * @param {string} keys 用,分隔的Map的key
 */
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

/**
 * 标记node树的static属性
 * @param {ASTNode} node AST元素、AST表达式、AST文本
 */
function markStatic (node: ASTNode) {
  node.static = isStatic(node) // node是否为静态节点
  if (node.type === 1) { // node是ASTElement
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) && // 非平台预留（原生）节点
      node.tag !== 'slot' && // 不是<slot>节点
      node.attrsMap['inline-template'] == null // 不是内联模板
    ) {
      return
    }
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child) // 递归处理子节点
      if (!child.static) { // 任何子节点不是静态节点，则该节点不是静态节点
        node.static = false
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block // node节点的条件的v-if所在的节点
        markStatic(block) // 处理v-if节点
        if (!block.static) { // 如果node节点有v-if、v-else-if、v-else，且v-if所在的节点为动态节点，则该节点也是动态节点
          node.static = false
        }
      }
    }
  }
}

/**
 * 标记node树的staticInFor属性
 * @param {ASTNode}} node AST元素、AST表达式、AST文本
 * @param {boolean} isInFor 是否在v-for节点内
 */
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) { // node是静态节点，且只有一个子节点，子节点为文本节点
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for) // 递归标记node的子节点
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor) // 标记node的条件的v-if节点
      }
    }
  }
}

/**
 * 是否为静态节点
 * @param {ASTNode}} node AST元素、AST表达式、AST文本
 */
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression 表达式
    return false
  }
  if (node.type === 3) { // text 文本
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
