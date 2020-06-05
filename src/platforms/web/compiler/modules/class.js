/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import {
  getAndRemoveAttr,
  getBindingAttr,
  baseWarn
} from 'compiler/helpers'

/**
 * 遍历节点的静态和动态class
 * @param {ASTElement} el 节点
 * @param {CompilerOptions} options 编译器配置对象，类型定义在flow/compiler.js中
 */
function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn // 警告方法
  const staticClass = getAndRemoveAttr(el, 'class') // 获取el的class特性的值，并将其移除
  if (process.env.NODE_ENV !== 'production' && staticClass) {
    const res = parseText(staticClass, options.delimiters)
    if (res) {
      warn(
        `class="${staticClass}": ` +
        'Interpolation inside attributes has been removed. ' +
        'Use v-bind or the colon shorthand instead. For example, ' +
        'instead of <div class="{{ val }}">, use <div :class="val">.',
        el.rawAttrsMap['class']
      )
    }
  }
  if (staticClass) { // 静态class
    el.staticClass = JSON.stringify(staticClass)
  }
  const classBinding = getBindingAttr(el, 'class', false /* getStatic */) // 获取el的class属性的值
  if (classBinding) { // 动态class的表达式
    el.classBinding = classBinding
  }
}

/**
 * 生成class相关的字符串格式的对象片段：class:[动态class的表达式], staticClass:[静态class]
 * @param {ASTElement} el
 */
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    data += `class:${el.classBinding},`
  }
  return data
}

export default {
  staticKeys: ['staticClass'], // 静态属性名
  transformNode,
  genData
}
