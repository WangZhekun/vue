/* @flow */

import config from 'core/config'
import { addHandler, addProp, getBindingAttr } from 'compiler/helpers'
import { genComponentModel, genAssignmentCode } from 'compiler/directives/model'

let warn

// in some cases, the event used has to be determined at runtime
// so we used some reserved tokens during compile.
export const RANGE_TOKEN = '__r' // 节点的type特性为range时的事件名
export const CHECKBOX_RADIO_TOKEN = '__c'

/**
 * 编译v-model指令
 * @param {ASTElement} el 节点
 * @param {ASTDirective} dir v-model指令相关数据的集合
 * @param {Function} _warn
 */
export default function model (
  el: ASTElement,
  dir: ASTDirective,
  _warn: Function
): ?boolean {
  warn = _warn
  const value = dir.value // v-model绑定的表达式
  const modifiers = dir.modifiers // 指令修饰符
  const tag = el.tag // 节点标签名
  const type = el.attrsMap.type // 节点type特性

  if (process.env.NODE_ENV !== 'production') {
    // inputs with type="file" are read only and setting the input's
    // value will throw an error.
    if (tag === 'input' && type === 'file') {
      warn(
        `<${el.tag} v-model="${value}" type="file">:\n` +
        `File inputs are read only. Use a v-on:change listener instead.`,
        el.rawAttrsMap['v-model']
      )
    }
  }

  if (el.component) { // 节点是组件
    genComponentModel(el, value, modifiers) // 生成组件的v-model指令的解析对象
    // component v-model doesn't need extra runtime
    return false
  } else if (tag === 'select') { // 节点是select
    genSelect(el, value, modifiers)
  } else if (tag === 'input' && type === 'checkbox') { // 节点是input type="checkbox"
    genCheckboxModel(el, value, modifiers)
  } else if (tag === 'input' && type === 'radio') { // 节点是input type="radio"
    genRadioModel(el, value, modifiers)
  } else if (tag === 'input' || tag === 'textarea') { // 节点是input type="textarea"
    genDefaultModel(el, value, modifiers) // 编译默认的v-model指令相关的属性和事件
  } else if (!config.isReservedTag(tag)) { // 节点不是平台原生标签
    genComponentModel(el, value, modifiers)
    // component v-model doesn't need extra runtime
    return false
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `<${el.tag} v-model="${value}">: ` +
      `v-model is not supported on this element type. ` +
      'If you are working with contenteditable, it\'s recommended to ' +
      'wrap a library dedicated for that purpose inside a custom component.',
      el.rawAttrsMap['v-model']
    )
  }

  // ensure runtime directive metadata
  return true
}

/**
 * 编译checkbox的v-model指令相关的属性和事件
 * @param {ASTElement} el 节点
 * @param {string} value v-model绑定的表达式
 * @param {ASTModifiers} modifiers 指令修饰符
 */
function genCheckboxModel (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
) {
  const number = modifiers && modifiers.number
  const valueBinding = getBindingAttr(el, 'value') || 'null' // 获取节点的value特性的值
  const trueValueBinding = getBindingAttr(el, 'true-value') || 'true' // 获取节点的value特性的值
  const falseValueBinding = getBindingAttr(el, 'false-value') || 'false' // 获取节点的value特性的值
  addProp(el, 'checked', // 给节点添加checked属性
    `Array.isArray(${value})` +
    `?_i(${value},${valueBinding})>-1` + (
      trueValueBinding === 'true'
        ? `:(${value})`
        : `:_q(${value},${trueValueBinding})`
    )
  )
  addHandler(el, 'change', // 添加节点的change事件，该事件处理方法需要放到首位
    `var $$a=${value},` +
        '$$el=$event.target,' +
        `$$c=$$el.checked?(${trueValueBinding}):(${falseValueBinding});` +
    'if(Array.isArray($$a)){' +
      `var $$v=${number ? '_n(' + valueBinding + ')' : valueBinding},` +
          '$$i=_i($$a,$$v);' +
      `if($$el.checked){$$i<0&&(${genAssignmentCode(value, '$$a.concat([$$v])')})}` + // genAssignmentCode是生成v-model的赋值语句
      `else{$$i>-1&&(${genAssignmentCode(value, '$$a.slice(0,$$i).concat($$a.slice($$i+1))')})}` +
    `}else{${genAssignmentCode(value, '$$c')}}`,
    null, true
  )
}

/**
 * 编译radio的v-model指令相关的属性和事件
 * @param {ASTElement} el 节点
 * @param {string} value v-model绑定的表达式
 * @param {ASTModifiers} modifiers 指令修饰符
 */
function genRadioModel (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
) {
  const number = modifiers && modifiers.number
  let valueBinding = getBindingAttr(el, 'value') || 'null' // 获取节点的value特性的值
  valueBinding = number ? `_n(${valueBinding})` : valueBinding
  addProp(el, 'checked', `_q(${value},${valueBinding})`) // 给节点添加checked属性
  addHandler(el, 'change', genAssignmentCode(value, valueBinding), null, true) // 给节点添加change事件
}

/**
 * 编译select的v-model指令相关的属性和事件
 * @param {ASTElement} el 节点
 * @param {string} value v-model绑定的表达式
 * @param {ASTModifiers} modifiers 指令修饰符
 */
function genSelect (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
) {
  const number = modifiers && modifiers.number
  const selectedVal = `Array.prototype.filter` +
    `.call($event.target.options,function(o){return o.selected})` +
    `.map(function(o){var val = "_value" in o ? o._value : o.value;` +
    `return ${number ? '_n(val)' : 'val'}})`

  const assignment = '$event.target.multiple ? $$selectedVal : $$selectedVal[0]'
  let code = `var $$selectedVal = ${selectedVal};`
  code = `${code} ${genAssignmentCode(value, assignment)}` // 生成v-model的赋值语句
  addHandler(el, 'change', code, null, true) // 给节点添加change事件
}

/**
 * 编译默认的v-model指令相关的属性和事件
 * @param {ASTElement} el 节点
 * @param {string} value v-model绑定的表达式
 * @param {ASTModifiers} modifiers 指令修饰符
 */
function genDefaultModel (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
): ?boolean {
  const type = el.attrsMap.type // 取type特性

  // warn if v-bind:value conflicts with v-model
  // except for inputs with v-bind:type
  if (process.env.NODE_ENV !== 'production') {
    const value = el.attrsMap['v-bind:value'] || el.attrsMap[':value']
    const typeBinding = el.attrsMap['v-bind:type'] || el.attrsMap[':type']
    if (value && !typeBinding) {
      const binding = el.attrsMap['v-bind:value'] ? 'v-bind:value' : ':value'
      warn(
        `${binding}="${value}" conflicts with v-model on the same element ` +
        'because the latter already expands to a value binding internally',
        el.rawAttrsMap[binding]
      )
    }
  }

  const { lazy, number, trim } = modifiers || {}
  const needCompositionGuard = !lazy && type !== 'range' // 事件处理需要做输入法的处理
  const event = lazy // 事件名
    ? 'change'
    : type === 'range'
      ? RANGE_TOKEN
      : 'input'

  let valueExpression = '$event.target.value' // 取值表达式
  if (trim) {
    valueExpression = `$event.target.value.trim()`
  }
  if (number) {
    valueExpression = `_n(${valueExpression})`
  }

  let code = genAssignmentCode(value, valueExpression) // 生成v-model的赋值语句
  if (needCompositionGuard) {
    code = `if($event.target.composing)return;${code}` // 如果输入法正在激活，则不处理事件
  }

  addProp(el, 'value', `(${value})`) // 给节点添加checked属性
  addHandler(el, event, code, null, true) // 给节点添加事件
  if (trim || number) {
    addHandler(el, 'blur', '$forceUpdate()') // 如果有trim或number修饰符，则添加blur事件，事件处理方法中强制更新 TODO: 为什么要强制更新
  }
}
