/* @flow */

import { genHandlers } from './events'
import baseDirectives from '../directives/index' // 基础指令
import { camelize, no, extend } from 'shared/util'
import { baseWarn, pluckModuleFunction } from '../helpers'
import { emptySlotScopeToken } from '../parser/index'

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (el: ASTElement, dir: ASTDirective, warn: Function) => boolean;

export class CodegenState { // render函数生成状态
  options: CompilerOptions; // 编译配置项
  warn: Function; // 警告函数
  transforms: Array<TransformFunction>; // 返回平台特殊模块配置中，属性名为transformCode的非空值
  dataGenFns: Array<DataGenFunction>; // 返回平台特殊模块配置中，属性名为genData的非空值
  directives: { [key: string]: DirectiveFunction }; // 合并基础指令和平台的特殊指令
  maybeComponent: (el: ASTElement) => boolean; // el是否为组件
  onceId: number;
  staticRenderFns: Array<string>;
  pre: boolean;

  constructor (options: CompilerOptions) {
    this.options = options
    this.warn = options.warn || baseWarn
    this.transforms = pluckModuleFunction(options.modules, 'transformCode')
    this.dataGenFns = pluckModuleFunction(options.modules, 'genData')
    this.directives = extend(extend({}, baseDirectives), options.directives)
    const isReservedTag = options.isReservedTag || no // 函数：标签在平台上是否是原生的
    this.maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)
    this.onceId = 0
    this.staticRenderFns = []
    this.pre = false
  }
}

export type CodegenResult = {
  render: string,
  staticRenderFns: Array<string>
};

/**
 * 生成ast对应的render和静态render函数
 * @param {ASTElement} ast ASTElement节点
 * @param {CompilerOptions} options 编译配置项
 */
export function generate (
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  const state = new CodegenState(options) // 创建CodegenState对象
  const code = ast ? genElement(ast, state) : '_c("div")'
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}

/**
 * 生成ASTElement节点
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
export function genElement (el: ASTElement, state: CodegenState): string {
  if (el.parent) {
    el.pre = el.pre || el.parent.pre
  }

  if (el.staticRoot && !el.staticProcessed) { // 静态根节点，且没处理过
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) { // v-once，且没处理过
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) { // v-for，且没处理过
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) { // v-if，且没处理过
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    return genSlot(el, state)
  } else {
    // component or element
    let code
    if (el.component) {
      code = genComponent(el.component, el, state)
    } else {
      let data
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        data = genData(el, state)
      }

      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code
  }
}

// hoist static sub-trees out
/**
 * 生成静态节点，格式：'_m(1,true)'
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
function genStatic (el: ASTElement, state: CodegenState): string {
  el.staticProcessed = true
  // Some elements (templates) need to behave differently inside of a v-pre
  // node.  All pre nodes are static roots, so we can use this as a location to
  // wrap a state change and reset it upon exiting the pre node.
  const originalPreState = state.pre
  if (el.pre) {
    state.pre = el.pre
  }
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)
  state.pre = originalPreState
  return `_m(${
    state.staticRenderFns.length - 1
  }${
    el.staticInFor ? ',true' : ''
  })`
}

// v-once
/**
 * 生成v-once节点，格式：'_o(...)'或同genStatic或同genIf
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
function genOnce (el: ASTElement, state: CodegenState): string {
  el.onceProcessed = true
  if (el.if && !el.ifProcessed) { // 如果有v-if，且没处理，则先处理if
    return genIf(el, state)
  } else if (el.staticInFor) {
    let key = ''
    let parent = el.parent
    while (parent) {
      if (parent.for) {
        key = parent.key
        break
      }
      parent = parent.parent
    }
    if (!key) {
      process.env.NODE_ENV !== 'production' && state.warn(
        `v-once can only be used inside v-for that is keyed. `,
        el.rawAttrsMap['v-once']
      )
      return genElement(el, state)
    }
    return `_o(${genElement(el, state)},${state.onceId++},${key})`
  } else {
    return genStatic(el, state)
  }
}

/**
 * 处理v-if，生成嵌套的三元表达式
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 * @param {Function} altGen
 * @param {string} altEmpty
 */
export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  el.ifProcessed = true // avoid recursion 避免递归
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty) // 复制el.ifConditions，并按照条件生成三元表达式
}

/**
 * 按照v-if的条件生成嵌套的三元表达式
 * @param {ASTIfConditions} conditions 条件列表
 * @param {CodegenState} state  render函数生成状态
 * @param {Function} altGen 三元表达式的生成第二元的函数
 * @param {string} altEmpty conditions为空时的返回值，默认为'_e()'
 */
function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) {
    return altEmpty || '_e()'
  }

  const condition = conditions.shift()
  if (condition.exp) {
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty) // 递归调用genIfConditions，处理所有if条件
    }`
  } else {
    return `${genTernaryExp(condition.block)}`
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  /**
   * 生成三元表达式
   * 如果存在altGen，则返回altGen()的返回值
   * 如果v-once，则返回genOnce()的返回值
   * 否则，返回genElement()的返回值
   * @param {ASTElement} el ASTElement节点
   */
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
}

/**
 * 处理v-for，生成'_l((item in arr), function(item, item, index){ return ...})'
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 * @param {Function} altGen 返回结果中'return'后的结果的执行函数
 * @param {string} altHelper 返回结果中'_l'字符串的替代字符串
 */
export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  el.forProcessed = true // avoid recursion
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` +
    '})'
}

/**
 * 生成ASTElement的属性集合的字符串，格式：_b({directives: ..., key:..., ...})
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
export function genData (el: ASTElement, state: CodegenState): string {
  let data = '{'

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  const dirs = genDirectives(el, state) // 处理指令，生成'directives:[{name:"...", ...}...]'
  if (dirs) data += dirs + ','

  // key
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  if (el.refInFor) {
    data += `refInFor:true,`
  }
  // pre
  if (el.pre) {
    data += `pre:true,`
  }
  // record original tag name for components using "is" attribute
  if (el.component) {
    data += `tag:"${el.tag}",`
  }
  // module data generation functions
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }
  // attributes
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }
  // DOM props
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }
  // event handlers
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }
  // slot target
  // only for non-scoped slots
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }
  // scoped slots
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }
  // component v-model
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }
  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}

/**
 * 处理指令，生成'directives:[{name:"...", ...}...]'
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
function genDirectives (el: ASTElement, state: CodegenState): string | void {
  const dirs = el.directives
  if (!dirs) return
  let res = 'directives:['
  let hasRuntime = false
  let i, l, dir, needRuntime
  for (i = 0, l = dirs.length; i < l; i++) {
    dir = dirs[i]
    needRuntime = true
    const gen: DirectiveFunction = state.directives[dir.name]
    if (gen) {
      // compile-time directive that manipulates AST.
      // returns true if it also needs a runtime counterpart.
      needRuntime = !!gen(el, dir, state.warn)
    }
    if (needRuntime) {
      hasRuntime = true
      res += `{name:"${dir.name}",rawName:"${dir.rawName}"${
        dir.value ? `,value:(${dir.value}),expression:${JSON.stringify(dir.value)}` : ''
      }${
        dir.arg ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}` : ''
      }${
        dir.modifiers ? `,modifiers:${JSON.stringify(dir.modifiers)}` : ''
      }},`
    }
  }
  if (hasRuntime) {
    return res.slice(0, -1) + ']'
  }
}

/**
 * 处理inline模板，格式：'inlineTemplate:{render:function(){generate函数的结果的render属性},staticRenderFns:[generate函数的结果的staticRenderFns属性转字符串]}'
 * @param {ASTElement} el ASTElement节点，有一个ASTElement子节点
 * @param {CodegenState} state render函数生成状态
 */
function genInlineTemplate (el: ASTElement, state: CodegenState): ?string {
  const ast = el.children[0]
  if (process.env.NODE_ENV !== 'production' && (
    el.children.length !== 1 || ast.type !== 1
  )) {
    state.warn(
      'Inline-template components must have exactly one child element.',
      { start: el.start }
    )
  }
  if (ast && ast.type === 1) {
    const inlineRenderFns = generate(ast, state.options)
    return `inlineTemplate:{render:function(){${
      inlineRenderFns.render
    }},staticRenderFns:[${
      inlineRenderFns.staticRenderFns.map(code => `function(){${code}}`).join(',')
    }]}`
  }
}

/**
 * 生成多个插槽，格式：'scopedSlots:_u([单个插槽],null,true,hash值)'
 * @param {ASTElement} el ASTElement节点
 * @param {Object} slots 插槽Map
 * @param {CodegenState} state render函数生成状态
 */
function genScopedSlots (
  el: ASTElement,
  slots: { [key: string]: ASTElement },
  state: CodegenState
): string {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  let needsForceUpdate = el.for || Object.keys(slots).some(key => { // 强制更新标志：el有v-for，或插槽节点有v-if、v-for、动态插槽名，包含为插槽的子节点
    const slot = slots[key]
    return (
      slot.slotTargetDynamic ||
      slot.if ||
      slot.for ||
      containsSlotChild(slot) // is passing down slot from parent which may be dynamic
    )
  })

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  let needsKey = !!el.if // 需要key属性

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) { // 遍历el的祖先节点，更新强制更新标志和需要key属性标志
    let parent = el.parent
    while (parent) {
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        needsForceUpdate = true
        break
      }
      if (parent.if) {
        needsKey = true
      }
      parent = parent.parent
    }
  }

  const generatedSlots = Object.keys(slots)
    .map(key => genScopedSlot(slots[key], state))
    .join(',')

  return `scopedSlots:_u([${generatedSlots}]${
    needsForceUpdate ? `,null,true` : ``
  }${
    !needsForceUpdate && needsKey ? `,null,false,${hash(generatedSlots)}` : ``
  })`
}

function hash(str) {
  let hash = 5381
  let i = str.length
  while(i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0
}

/**
 * el树包含<slot>节点
 * @param {ASTNode} el ASTNode节点
 */
function containsSlotChild (el: ASTNode): boolean {
  if (el.type === 1) {
    if (el.tag === 'slot') {
      return true
    }
    return el.children.some(containsSlotChild)
  }
  return false
}

/**
 * 处理插槽，格式：'{key:插槽名,fn:function(插槽名){return 节点生成结果},proxy:true}'
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
function genScopedSlot (
  el: ASTElement,
  state: CodegenState
): string {
  const isLegacySyntax = el.attrsMap['slot-scope']
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, `null`)
  }
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot)
  }
  const slotScope = el.slotScope === emptySlotScopeToken
    ? ``
    : String(el.slotScope)
  const fn = `function(${slotScope}){` +
    `return ${el.tag === 'template'
      ? el.if && isLegacySyntax
        ? `(${el.if})?${genChildren(el, state) || 'undefined'}:undefined`
        : genChildren(el, state) || 'undefined'
      : genElement(el, state)
    }}`
  // reverse proxy v-slot without scope on this.$slots
  const reverseProxy = slotScope ? `` : `,proxy:true`
  return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`
}

/**
 * 处理子节点，格式：'处理节点的结果,1|0' 或 '[节点处理结果,节点处理结果...],需要标准化的程度'
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 * @param {boolean} checkSkip 是否检查是否需要标准化
 * @param {Function} altGenElement genElement的替代函数
 * @param {Function} altGenNode genNode的替代函数
 */
export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // optimize single v-for
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {
      const normalizationType = checkSkip
        ? state.maybeComponent(el) ? `,1` : `,0`
        : ``
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    const gen = altGenNode || genNode
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}

// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
/**
 * 确定子节点是否需要标准化，0 —— 不需要标准化，1 —— 需要简单标准化，2 —— 需要深入标准化
 * @param {Array<ASTNode>} children 子字节列表
 * @param {Function} maybeComponent 函数-是否是组件
 */
function getNormalizationType (
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i]
    if (el.type !== 1) {
      continue
    }
    if (needsNormalization(el) ||
        (el.ifConditions && el.ifConditions.some(c => needsNormalization(c.block)))) { // 当前节点需要标准化，或有条件渲染，v-if的节点需要标准化
      res = 2
      break
    }
    if (maybeComponent(el) ||
        (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))) { // 当前节点是组件，或有条件渲染，v-if的节点为组件
      res = 1
    }
  }
  return res
}

/**
 * 节点有v-for或为<template>或<slot>，需要做标准化
 * @param {ASTElement} el ASTElement节点
 */
function needsNormalization (el: ASTElement): boolean {
  return el.for !== undefined || el.tag === 'template' || el.tag === 'slot'
}

/**
 * 生成AST元素、注释、文本
 * @param {ASTNode} node AST元素、注释、文本
 * @param {CodegenState} state render函数生成状态
 */
function genNode (node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) {
    return genComment(node)
  } else {
    return genText(node)
  }
}

/**
 * 生成文本节点，格式：'_v(文本/文本表达式)'
 * @param {ASTText | ASTExpression} text ASTText或ASTExpression节点
 */
export function genText (text: ASTText | ASTExpression): string {
  return `_v(${text.type === 2
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}

/**
 * 生成注释，格式：'_e(注释文本)'
 * @param {ASTText} comment ASTText节点
 */
export function genComment (comment: ASTText): string {
  return `_e(${JSON.stringify(comment.text)})`
}

/**
 * 生成插槽节点，格式：'_t(插槽名, 子组件, 属性, 动态绑定表达式)'
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
function genSlot (el: ASTElement, state: CodegenState): string {
  const slotName = el.slotName || '"default"' // 插槽名
  const children = genChildren(el, state)
  let res = `_t(${slotName}${children ? `,${children}` : ''}`
  const attrs = el.attrs || el.dynamicAttrs
    ? genProps((el.attrs || []).concat(el.dynamicAttrs || []).map(attr => ({
        // slot props are camelized
        name: camelize(attr.name),
        value: attr.value,
        dynamic: attr.dynamic
      })))
    : null
  const bind = el.attrsMap['v-bind']
  if ((attrs || bind) && !children) {
    res += `,null`
  }
  if (attrs) {
    res += `,${attrs}`
  }
  if (bind) {
    res += `${attrs ? '' : ',null'},${bind}`
  }
  return res + ')'
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
/**
 * 生成指令，格式：'_c(组件名,_b({...}), 子组件)'
 * @param {string} componentName 组件名
 * @param {ASTElement} el ASTElement节点
 * @param {CodegenState} state render函数生成状态
 */
function genComponent (
  componentName: string,
  el: ASTElement,
  state: CodegenState
): string {
  const children = el.inlineTemplate ? null : genChildren(el, state, true)
  return `_c(${componentName},${genData(el, state)}${
    children ? `,${children}` : ''
  })`
}

/**
 * 生成静态属性或动态属性的字符串，静态属性：'{属性名:属性值}'，动态属性：'_d(静态属性, [属性名,属性值,属性名,属性值...])'
 * @param {Array<ASTAttr>} props AST属性列表
 */
function genProps (props: Array<ASTAttr>): string {
  let staticProps = ``
  let dynamicProps = ``
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]
    const value = __WEEX__
      ? generateValue(prop.value)
      : transformSpecialNewlines(prop.value)
    if (prop.dynamic) {
      dynamicProps += `${prop.name},${value},`
    } else {
      staticProps += `"${prop.name}":${value},`
    }
  }
  staticProps = `{${staticProps.slice(0, -1)}}`
  if (dynamicProps) {
    return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`
  } else {
    return staticProps
  }
}

/* istanbul ignore next */
function generateValue (value) {
  if (typeof value === 'string') {
    return transformSpecialNewlines(value)
  }
  return JSON.stringify(value)
}

// #3895, #4268
function transformSpecialNewlines (text: string): string {
  return text
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
