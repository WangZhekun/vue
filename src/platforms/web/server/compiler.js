/* @flow */

import { baseOptions } from '../compiler/options'
import { createCompiler } from 'server/optimizing-compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions) // 创建编译函数及转换函数

export {
  compile as ssrCompile,
  compileToFunctions as ssrCompileToFunctions
}
