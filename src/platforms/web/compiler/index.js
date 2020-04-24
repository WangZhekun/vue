/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

const {
  compile, // 模板的编译函数
  compileToFunctions // 转换函数 —— 编译模板并将字符串状态的render和静态render函数转化为Function
} = createCompiler(baseOptions)

export { compile, compileToFunctions }
