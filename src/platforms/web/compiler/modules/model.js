/* @flow */

/**
 * Expand input[v-model] with dynamic type bindings into v-if-else chains
 * Turn this:
 *   <input v-model="data[type]" :type="type">
 * into this:
 *   <input v-if="type === 'checkbox'" type="checkbox" v-model="data[type]">
 *   <input v-else-if="type === 'radio'" type="radio" v-model="data[type]">
 *   <input v-else :type="type" v-model="data[type]">
 */

import {
  addRawAttr,
  getBindingAttr,
  getAndRemoveAttr
} from 'compiler/helpers'

import {
  processFor,
  processElement,
  addIfCondition,
  createASTElement
} from 'compiler/parser/index'

/**
 * 处理有v-model指令的input的动态type属性
 * TODO：这个方法看不大明白
 * @param {ASTElement} el 节点
 * @param {CompilerOptions} options 编译器配置对象，类型定义在flow/compiler.js中
 */
function preTransformNode (el: ASTElement, options: CompilerOptions) {
  if (el.tag === 'input') { // 节点是input
    const map = el.attrsMap // 特性集合
    if (!map['v-model']) { // 没有v-model特性
      return
    }

    let typeBinding
    if (map[':type'] || map['v-bind:type']) { // 绑定了type特性
      typeBinding = getBindingAttr(el, 'type') // 获取节点的type特性的表达式
    }
    if (!map.type && !typeBinding && map['v-bind']) { // 节点没有静态的type特性，没有动态type特性，有v-bind特性
      typeBinding = `(${map['v-bind']}).type` // 生成取type属性值的字符串：取v-bind特性的表达式所表示的对象的type属性
    }

    if (typeBinding) { // 动态type特性有值
      const ifCondition = getAndRemoveAttr(el, 'v-if', true) // 取v-if特性的表达式
      const ifConditionExtra = ifCondition ? `&&(${ifCondition})` : `` // 生成v-if条件的判断字符串
      const hasElse = getAndRemoveAttr(el, 'v-else', true) != null // 取v-else特性的表达式。有else分支
      const elseIfCondition = getAndRemoveAttr(el, 'v-else-if', true) // 取v-else-if特性的表达式
      // 1. checkbox
      const branch0 = cloneASTElement(el) // 复制节点
      // process for on the main node
      processFor(branch0) // 编译v-for
      addRawAttr(branch0, 'type', 'checkbox') // 添加未加工的特性type
      processElement(branch0, options) // 编译branch0的各种属性，包括<slot>
      branch0.processed = true // prevent it from double-processed
      branch0.if = `(${typeBinding})==='checkbox'` + ifConditionExtra
      addIfCondition(branch0, { // 将{exp: ..., block: ...}添加到branch0的ifConditions中
        exp: branch0.if,
        block: branch0
      })
      // 2. add radio else-if condition
      const branch1 = cloneASTElement(el) // 复制节点
      getAndRemoveAttr(branch1, 'v-for', true) // 获取v-for特性的表达式
      addRawAttr(branch1, 'type', 'radio') // 添加未加工的特性type
      processElement(branch1, options) // 编译branch1的各种属性，包括<slot>
      addIfCondition(branch0, { // 将{exp: ..., block: ...}添加到branch0的ifConditions中  TODO：这里为什么要给branch0添加if条件
        exp: `(${typeBinding})==='radio'` + ifConditionExtra,
        block: branch1
      })
      // 3. other
      const branch2 = cloneASTElement(el) // 复制节点
      getAndRemoveAttr(branch2, 'v-for', true) // 获取v-for特性的表达式
      addRawAttr(branch2, ':type', typeBinding) // 添加未加工的特性type
      processElement(branch2, options) // 编译branch2的各种属性，包括<slot>
      addIfCondition(branch0, {// 将{exp: ..., block: ...}添加到branch0的ifConditions中
        exp: ifCondition,
        block: branch2
      })

      if (hasElse) { // 有else分支
        branch0.else = true
      } else if (elseIfCondition) { // 有v-else-if分支
        branch0.elseif = elseIfCondition
      }

      return branch0
    }
  }
}

/**
 * 复制节点
 * @param {ASTElement} el 节点
 */
function cloneASTElement (el) {
  return createASTElement(el.tag, el.attrsList.slice(), el.parent)
}

export default {
  preTransformNode
}
