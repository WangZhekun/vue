/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
/**
 * createCompiler为编译函数及转换函数的工厂函数
 */
export const createCompiler = createCompilerCreator(function baseCompile ( // 处理模板，生成ASTElement树，生成render和静态render函数  template: 模板  options: 编译配置
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options) // 解析模板，生成ASTElement树
  if (options.optimize !== false) {
    optimize(ast, options) // 标记ast树的static和staticInFor属性，即其他static相关全局变量
  }
  const code = generate(ast, options) // 生成ast对应的render和静态render函数
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
