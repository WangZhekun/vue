/* @flow */

/**
 * Cross-platform code generation for component v-model
 */
/**
 * 生成组件的v-model指令的解析对象
 * @param {ASTElement} el 节点
 * @param {string} value v-model绑定的表达式
 * @param {ASTModifiers} modifiers 指令修饰符
 */
export function genComponentModel (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
): ?boolean {
  const { number, trim } = modifiers || {}

  const baseValueExpression = '$$v'
  let valueExpression = baseValueExpression
  if (trim) { // trim修饰符
    valueExpression =
      `(typeof ${baseValueExpression} === 'string'` +
      `? ${baseValueExpression}.trim()` +
      `: ${baseValueExpression})`
  }
  if (number) { // number修饰符
    valueExpression = `_n(${valueExpression})`
  }
  const assignment = genAssignmentCode(value, valueExpression) // 生成v-model的赋值语句

  el.model = { // 生成model属性
    value: `(${value})`, // v-model的取值表达式
    expression: JSON.stringify(value), // 绑定的表达式
    callback: `function (${baseValueExpression}) {${assignment}}` // v-model的赋值函数
  }
}

/**
 * Cross-platform codegen helper for generating v-model value assignment code.
 */
/**
 * 生成v-model的赋值语句
 * @param {string} value v-model绑定的表达式
 * @param {string} assignment 给v-model绑定的表达式赋值的表达式
 */
export function genAssignmentCode (
  value: string,
  assignment: string
): string {
  const res = parseModel(value) // 解析v-model的表达式
  if (res.key === null) { // 表达式中不包含.和[]
    return `${value}=${assignment}`
  } else {
    return `$set(${res.exp}, ${res.key}, ${assignment})`
  }
}

/**
 * Parse a v-model expression into a base path and a final key segment.
 * Handles both dot-path and possible square brackets.
 *
 * Possible cases:
 *
 * - test
 * - test[key]
 * - test[test1[key]]
 * - test["a"][key]
 * - xxx.test[a[a].test1[key]]
 * - test.xxx.a["asa"][test1[key]]
 *
 */

/**
 * len为表达式的长度
 * str为表达式
 * chr为当前遍历表达式的字符
 * index为当前遍历表达式的位置
 * expressionPos为最后一组[]的起始字符的位置
 * expressionEndPos为最后一组[]的结尾字符的位置
 */
let len, str, chr, index, expressionPos, expressionEndPos

type ModelParseResult = {
  exp: string,
  key: string | null
}

/**
 * 解析v-model的表达式，结果为{exp: 属性或索引所属的对象的表达式, key: 属性名或索引}
 * @param {string} val v-model绑定的表达式
 */
export function parseModel (val: string): ModelParseResult {
  // Fix https://github.com/vuejs/vue/pull/7730
  // allow v-model="obj.val " (trailing whitespace)
  val = val.trim()
  len = val.length // 表达式长度

  if (val.indexOf('[') < 0 || val.lastIndexOf(']') < len - 1) { // 不包含[，或不以]结尾
    index = val.lastIndexOf('.') // .的位置
    if (index > -1) { // 表达式中存在.
      return {
        exp: val.slice(0, index), // 取.之前的表达式
        key: '"' + val.slice(index + 1) + '"' // .之后的字符串
      }
    } else {
      return {
        exp: val,
        key: null
      }
    }
  }

  str = val // 表达式
  index = expressionPos = expressionEndPos = 0

  while (!eof()) { // 遍历表达式
    chr = next() // 取下一个字符
    /* istanbul ignore if */
    if (isStringStart(chr)) { // 当前字符是否为字符串的起始字符
      parseString(chr) // 将index移到字符串之后
    } else if (chr === 0x5B) { // 0x5B 为[
      parseBracket(chr) // 将index移到[]的结尾字符
    }
  }

  return {
    exp: val.slice(0, expressionPos), // 取最后一组[]之前的部分
    key: val.slice(expressionPos + 1, expressionEndPos) // 取最后一组[]之间的部分
  }
}

/**
 * 取表达式的下一个字符
 */
function next (): number {
  return str.charCodeAt(++index)
}

/**
 * 是否遍历完成
 */
function eof (): boolean {
  return index >= len
}

/**
 * 是否是字符串的起始字符
 * @param {number} chr 字符编码
 */
function isStringStart (chr: number): boolean {
  return chr === 0x22 || chr === 0x27 // 0x22 为" 0x27为'
}

/**
 * 将index移到[]的结尾字符
 * @param {number} chr 字符编码，为[的编码
 */
function parseBracket (chr: number): void {
  let inBracket = 1 // [字符的计数器
  expressionPos = index
  while (!eof()) {
    chr = next()
    if (isStringStart(chr)) { // 是字符串的起始字符
      parseString(chr) // 将index移到字符串之后
      continue
    }
    if (chr === 0x5B) inBracket++ // 0x5B 为[
    if (chr === 0x5D) inBracket-- // 0x5D 为]
    if (inBracket === 0) { // 找到char作为[的结尾]字符
      expressionEndPos = index
      break
    }
  }
}

/**
 * 将index移到字符串之后
 * @param {number} chr 字符编码，字符串的起始字符
 */
function parseString (chr: number): void {
  const stringQuote = chr
  while (!eof()) {
    chr = next()
    if (chr === stringQuote) {
      break
    }
  }
}
