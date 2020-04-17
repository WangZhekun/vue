/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

/**
 * createCompiler函的工厂函数
 * @param {Function} baseCompile
 */
export function createCompilerCreator (baseCompile: Function): Function {
  /**
   * @param {Function} baseOptions 编译器配置对象，类型定义在flow/compiler.js中
   */
  return function createCompiler (baseOptions: CompilerOptions) {
    /**
     *
     * @param {string} template 模板
     * @param {CompilerOptions} options 编译器配置对象，类型定义在flow/compiler.js中
     */
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions) // 以baseOptions为原型创建新配置对象
      const errors = []
      const tips = []

      /**
       * 重新定义配置中的warn方法，warn方法功能：添加错误或提示到相应的队列
       * @param {string} msg 错误或提示信息
       * @param {?} tip 提示信息标志，如果不存在，则加入到错误队列
       */
      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) { // 如果options存在，则合并到finalOptions中
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      const compiled = baseCompile(template.trim(), finalOptions)
      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
      }
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
