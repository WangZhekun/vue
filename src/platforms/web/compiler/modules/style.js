/* @flow */

import { parseText } from 'compiler/parser/text-parser'
import { parseStyleText } from 'web/util/style'
import {
  getAndRemoveAttr,
  getBindingAttr,
  baseWarn
} from 'compiler/helpers'

/**
 * 编译节点的style
 * @param {ASTElement} el 节点
 * @param {CompilerOptions} options 编译器配置对象，类型定义在flow/compiler.js中
 */
function transformNode (el: ASTElement, options: CompilerOptions) {
  const warn = options.warn || baseWarn
  const staticStyle = getAndRemoveAttr(el, 'style') // 获取节点的style特性（静态style）
  if (staticStyle) { // 静态style特性存在
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      const res = parseText(staticStyle, options.delimiters)
      if (res) {
        warn(
          `style="${staticStyle}": ` +
          'Interpolation inside attributes has been removed. ' +
          'Use v-bind or the colon shorthand instead. For example, ' +
          'instead of <div style="{{ val }}">, use <div :style="val">.',
          el.rawAttrsMap['style']
        )
      }
    }
    el.staticStyle = JSON.stringify(parseStyleText(staticStyle)) // 将静态样式转为对象，再转为JSON串
  }

  const styleBinding = getBindingAttr(el, 'style', false /* getStatic */) // 获取节点的动态style
  if (styleBinding) {
    el.styleBinding = styleBinding
  }
}

/**
 * 生成style相关的字符串格式的对象片段：style:[动态style的表达式], staticStyle:[静态style]
 * @param {ASTElement} el
 */
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticStyle) {
    data += `staticStyle:${el.staticStyle},`
  }
  if (el.styleBinding) {
    data += `style:(${el.styleBinding}),`
  }
  return data
}

export default {
  staticKeys: ['staticStyle'], // 静态属性名
  transformNode,
  genData
}
