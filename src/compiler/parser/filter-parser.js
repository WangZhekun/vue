/* @flow */

const validDivisionCharRE = /[\w).+\-_$\]]/

/**
 * 处理表达式中的过滤器
 * @param {string} exp v-bind指令的属性后的表达式
 */
export function parseFilters (exp: string): string {
  let inSingle = false // 在单引号内
  let inDouble = false // 在双引号内
  let inTemplateString = false // 在模板内
  let inRegex = false // 在正则表达式内
  let curly = 0 // 左大括号数量
  let square = 0 // 左中括号数量
  let paren = 0 // 左小括号数量
  let lastFilterIndex = 0 // 前一个过滤器的索引
  let c, prev, i, expression, filters

  for (i = 0; i < exp.length; i++) {
    prev = c // 前一个字符
    c = exp.charCodeAt(i) // 当前字符
    if (inSingle) {
      if (c === 0x27 && prev !== 0x5C) inSingle = false // 0x27为' 0x5C为\
    } else if (inDouble) {
      if (c === 0x22 && prev !== 0x5C) inDouble = false // 0x22为"
    } else if (inTemplateString) {
      if (c === 0x60 && prev !== 0x5C) inTemplateString = false // 0x60为<
    } else if (inRegex) {
      if (c === 0x2f && prev !== 0x5C) inRegex = false // 0x2f为/
    } else if (
      c === 0x7C && // pipe 0x7C为| 管道符
      exp.charCodeAt(i + 1) !== 0x7C && // 后一个字符不是|
      exp.charCodeAt(i - 1) !== 0x7C && // 前一个字符不是|
      !curly && !square && !paren
    ) {
      if (expression === undefined) {
        // first filter, end of expression
        lastFilterIndex = i + 1
        expression = exp.slice(0, i).trim() // 截取管道符前的字符串，并去除空格
      } else {
        pushFilter() // 处理过滤器
      }
    } else { // 其他情况
      switch (c) {
        case 0x22: inDouble = true; break         // "
        case 0x27: inSingle = true; break         // '
        case 0x60: inTemplateString = true; break // `
        case 0x28: paren++; break                 // (
        case 0x29: paren--; break                 // )
        case 0x5B: square++; break                // [
        case 0x5D: square--; break                // ]
        case 0x7B: curly++; break                 // {
        case 0x7D: curly--; break                 // }
      }
      if (c === 0x2f) { // /
        let j = i - 1
        let p
        // find first non-whitespace prev char
        // 找到i索引之前最后一个非空白字符索引
        for (; j >= 0; j--) {
          p = exp.charAt(j)
          if (p !== ' ') break
        }
        if (!p || !validDivisionCharRE.test(p)) {
          inRegex = true
        }
      }
    }
  }

  if (expression === undefined) {  // 没有过滤器
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) { // 处理最后一个过滤器
    pushFilter() // 处理过滤器
  }

  /**
   * 处理过滤器
   */
  function pushFilter () {
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim()) // 取出过滤器
    lastFilterIndex = i + 1 // 前一个过滤的索引
  }

  if (filters) { // 存在过滤器
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i]) // 翻译包含过滤器的表达式
    }
  }

  return expression // 返回表达式
}

/**
 * 翻译包含过滤器的表达式
 * @param {string} exp 表达式
 * @param {string} filter 过滤器字符串
 */
function wrapFilter (exp: string, filter: string): string {
  const i = filter.indexOf('(')
  if (i < 0) { // 过滤器中不包含(
    // _f: resolveFilter
    return `_f("${filter}")(${exp})`
  } else {
    const name = filter.slice(0, i)
    const args = filter.slice(i + 1)
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
