/* @flow */

import { addProp } from 'compiler/helpers'

/**
 * v-html指令
 * @param {ASTElement} el 节点
 * @param {ASTDirective} dir TODO: 这个待定
 */
export default function html (el: ASTElement, dir: ASTDirective) {
  if (dir.value) { // v-html绑定的表达式
    addProp(el, 'innerHTML', `_s(${dir.value})`, dir) // 添加innerHTML属性，_s是toString
  }
}
