import { isPlainObject } from 'shared/util'

const vm = require('vm')
const path = require('path')
const resolve = require('resolve')
const NativeModule = require('module')

/**
 * 创建一个沙盒对象
 * @param {Object} context 渲染上下文
 * @returns
 */
function createSandbox (context) {
  const sandbox = { // 沙盒内的一些全局api
    Buffer,
    console,
    process,
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,
    __VUE_SSR_CONTEXT__: context // 渲染上下文
  }
  sandbox.global = sandbox
  return sandbox
}

/**
 * 获取可以执行模块的函数
 * @param {Map} files 模块文件路径与文件内容的映射
 * @param {string} basedir 读取vue-ssr-server-bundle.json文件的目录
 * @param {*} runInNewContext
 * @returns
 */
function compileModule (files, basedir, runInNewContext) {
  const compiledScripts = {} // 模块文件的文件名到编译结果的映射
  const resolvedModules = {} // 外部依赖的文件名到文件绝对路径的映射

  /**
   * 编译filename文件对应的模块内容
   * @param {string} filename 文件路径
   * @returns
   */
  function getCompiledScript (filename) {
    if (compiledScripts[filename]) {
      return compiledScripts[filename]
    }
    const code = files[filename] // 获取文件内容
    const wrapper = NativeModule.wrap(code) // 将文件内容包装成模块。用'(function (exports, require, module, __filename, __dirname) { ' 和 '\n});' 包裹code
    const script = new vm.Script(wrapper, { // 编译模块，但不执行
      filename, // 供脚本生成的堆栈跟踪信息所使用的文件名
      displayErrors: true
    })
    compiledScripts[filename] = script
    return script
  }

  /**
   * 执行filename的模块内容，获取模块的导出项
   * @param {string} filename 模块的文件路径
   * @param {Object} sandbox 沙盒对象
   * @param {Object} evaluatedFiles 模块文件的名称到模块导出项的映射
   * @returns
   */
  function evaluateModule (filename, sandbox, evaluatedFiles = {}) {
    if (evaluatedFiles[filename]) {
      return evaluatedFiles[filename]
    }

    const script = getCompiledScript(filename) // 编译filename文件对应的模块内容
    const compiledWrapper = runInNewContext === false // compiledWrapper是一个函数，function (exports, require, module, __filename, __dirname){...}
      ? script.runInThisContext() // 在当前脚本的上下文中执行模块
      : script.runInNewContext(sandbox) // 以沙盒对象作为上下文，执行模块
    const m = { exports: {}} // 模块的module变量，exports为模块的exports api
    const r = file => { // 模块的require api
      file = path.posix.join('.', file) // 将file拼接为当前路径的文件
      if (files[file]) { // 在bundle内找到依赖的文件
        return evaluateModule(file, sandbox, evaluatedFiles)
      } else if (basedir) {
        return require( // 依赖basedir目录下的文件
          resolvedModules[file] ||
          (resolvedModules[file] = resolve.sync(file, { basedir })) // 获取文件的绝对路径
        )
      } else {
        return require(file) // 依赖外部文件
      }
    }
    compiledWrapper.call(m.exports, m.exports, r, m) // 执行模块的包裹函数

    const res = Object.prototype.hasOwnProperty.call(m.exports, 'default') // 获取模块的导出项
      ? m.exports.default
      : m.exports
    evaluatedFiles[filename] = res
    return res
  }
  return evaluateModule
}

function deepClone (val) {
  if (isPlainObject(val)) {
    const res = {}
    for (const key in val) {
      res[key] = deepClone(val[key])
    }
    return res
  } else if (Array.isArray(val)) {
    return val.slice()
  } else {
    return val
  }
}

/**
 * 创建一个可以能执行entry模块脚本的函数
 * @param {string} entry 入口模块文件的路径
 * @param {Map} files 模块文件路径与文件内容的映射
 * @param {string} basedir 读取vue-ssr-server-bundle.json文件的目录
 * @param {Boolean} runInNewContext 执行bundle模块时是否在新的node上下文中执行。当为true时，每次执行该函数返回的BundleRunner函数都创建新的执行上下文；当为once，在创建BundleRunner函数时，创建新的执行上下文，之后每次都使用该对象；当为false时，使用当前脚本的global全局对象作为执行上下文
 * @returns 返回一个可以能执行entry模块脚本的函数，(userContect) => Promise
 */
export function createBundleRunner (entry, files, basedir, runInNewContext) {
  const evaluate = compileModule(files, basedir, runInNewContext) // 获取可以执行模块的函数
  if (runInNewContext !== false && runInNewContext !== 'once') { // 在新的执行上下文中执行模块代码
    // new context mode: creates a fresh context and re-evaluate the bundle
    // on each render. Ensures entire application state is fresh for each
    // render, but incurs extra evaluation cost.
    return (userContext = {}) => new Promise(resolve => { // userContext为渲染上下文
      userContext._registeredComponents = new Set() // 在入口模块导出的函数执行过程中，会插入数据。是在vue-loader转换代码时插入的
      const res = evaluate(entry, createSandbox(userContext)) // 在新的执行上下文下，执行入口模块，获取模块的导出结果
      resolve(typeof res === 'function' ? res(userContext) : res) // 如果导出结果为函数，则执行函数
    })
  } else {
    // direct mode: instead of re-evaluating the whole bundle on
    // each render, it simply calls the exported function. This avoids the
    // module evaluation costs but requires the source code to be structured
    // slightly differently.
    let runner // lazy creation so that errors can be caught by user
    let initialContext
    return (userContext = {}) => new Promise(resolve => {
      if (!runner) {
        const sandbox = runInNewContext === 'once'
          ? createSandbox() // 创建新的执行上下文，沙盒对象只创建一次
          : global // 用当前模块的全局变量作为执行上下文
        // the initial context is only used for collecting possible non-component
        // styles injected by vue-style-loader.
        initialContext = sandbox.__VUE_SSR_CONTEXT__ = {} // 在entry模块内可以访问到__VUE_SSR_CONTEXT__对象，该对象是渲染上下文。该位置enry模块导出的函数并未执行（即并未实际渲染），所以需要先将__VUE_SSR_CONTEXT__置空
        runner = evaluate(entry, sandbox) // 执行enry模块，获取模块的导出结果（是一个函数）
        // On subsequent renders, __VUE_SSR_CONTEXT__ will not be available
        // to prevent cross-request pollution.
        delete sandbox.__VUE_SSR_CONTEXT__
        if (typeof runner !== 'function') {
          throw new Error(
            'bundle export should be a function when using ' +
            '{ runInNewContext: false }.'
          )
        }
      }
      userContext._registeredComponents = new Set()

      // vue-style-loader styles imported outside of component lifecycle hooks
      if (initialContext._styles) { // 在vue-style-loader中，当服务端渲染，且css文件以模块的形式引入到js中，会在上下文执行对象中添加_styles属性，值为css文件的内容
        userContext._styles = deepClone(initialContext._styles)
        // #6353 ensure "styles" is exposed even if no styles are injected
        // in component lifecycles.
        // the renderStyles fn is exposed by vue-style-loader >= 3.0.3
        const renderStyles = initialContext._renderStyles
        if (renderStyles) {
          Object.defineProperty(userContext, 'styles', {
            enumerable: true,
            get () {
              return renderStyles(userContext._styles)
            }
          })
        }
      }

      resolve(runner(userContext)) // 模块导出结果为函数，执行函数
    })
  }
}
