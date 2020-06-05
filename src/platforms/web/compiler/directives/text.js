/* @flow */

import { addProp } from 'compiler/helpers'

/**
 * 编译v-text指令
 * @param {ASTElement} el 节点
 * @param {ASTDirective} dir v-text指令相关数据的集合
 */
export default function text (el: ASTElement, dir: ASTDirective) {
  if (dir.value) { // v-text绑定的表达式
    addProp(el, 'textContent', `_s(${dir.value})`, dir) // 给节点添加textContent属性，textContent 属性设置或返回指定节点的文本内容，以及它的所有后代。_s是toString
  }
}
