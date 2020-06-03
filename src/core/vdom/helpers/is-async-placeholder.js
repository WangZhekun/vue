/* @flow */

/**
 * 虚拟节点是异步占位接单
 * @param {VNode} node 虚拟节点
 */
export function isAsyncPlaceholder (node: VNode): boolean {
  return node.isComment && node.asyncFactory // 虚拟节点是注释节点，或异步组件工厂函数
}
