/* @flow */

const path = require('path')
const serialize = require('serialize-javascript')

import { isJS, isCSS } from '../util'
import TemplateStream from './template-stream'
import { parseTemplate } from './parse-template'
import { createMapper } from './create-async-file-mapper'
import type { ParsedTemplate } from './parse-template'
import type { AsyncFileMapper } from './create-async-file-mapper'

type TemplateRendererOptions = {
  template?: string | (content: string, context: any) => string;
  inject?: boolean;
  clientManifest?: ClientManifest;
  shouldPreload?: (file: string, type: string) => boolean;
  shouldPrefetch?: (file: string, type: string) => boolean;
  serializer?: Function;
};

export type ClientManifest = {
  publicPath: string;
  all: Array<string>;
  initial: Array<string>;
  async: Array<string>;
  modules: {
    [id: string]: Array<number>;
  },
  hasNoCssVersion?: {
    [file: string]: boolean;
  }
};

type Resource = {
  file: string;
  extension: string;
  fileWithoutQuery: string;
  asType: string;
};

/**
 * HTML模板渲染对象，作用是将Vue实例渲染出的DOM字符串插入到HTMl模板中，并生成HTML中的其他部分，如<head>、css、js节点等
 */
export default class TemplateRenderer {
  options: TemplateRendererOptions;
  inject: boolean;
  parsedTemplate: ParsedTemplate | Function | null; // 用来
  publicPath: string;
  clientManifest: ClientManifest;
  preloadFiles: Array<Resource>;
  prefetchFiles: Array<Resource>;
  mapFiles: AsyncFileMapper;
  serialize: Function;

  constructor (options: TemplateRendererOptions) {
    this.options = options
    this.inject = options.inject !== false
    // if no template option is provided, the renderer is created
    // as a utility object for rendering assets like preload links and scripts.

    const { template } = options // template为将Vue实例渲染结果填装的HTML文件模板
    this.parsedTemplate = template // 将template解析成head、neck、tail三部分组成的预编译模板对象对象
      ? typeof template === 'string'
        ? parseTemplate(template)
        : template
      : null

    // function used to serialize initial state JSON
    this.serialize = options.serializer || (state => {
      return serialize(state, { isJSON: true })
    })

    // extra functionality with client manifest
    if (options.clientManifest) {
      const clientManifest = this.clientManifest = options.clientManifest
      // ensure publicPath ends with /
      this.publicPath = clientManifest.publicPath === ''
        ? ''
        : clientManifest.publicPath.replace(/([^\/])$/, '$1/')
      // preload/prefetch directives
      this.preloadFiles = (clientManifest.initial || []).map(normalizeFile)
      this.prefetchFiles = (clientManifest.async || []).map(normalizeFile)
      // initial async chunk mapping
      this.mapFiles = createMapper(clientManifest)
    }
  }

  /**
   * 将当前TemplateRenderer实例的renderResourceHints、renderState、renderScripts、renderStyles、getPreloadFiles绑定所属对象后，植入到context中
   * @param {Object} context 渲染上下文对象
   */
  bindRenderFns (context: Object) {
    const renderer: any = this
    ;['ResourceHints', 'State', 'Scripts', 'Styles'].forEach(type => { // 将当前实例的renderResourceHints、renderState、renderScripts、renderStyles方法，绑定所属对象后，植入到渲染向上下文对象中
      context[`render${type}`] = renderer[`render${type}`].bind(renderer, context)
    })
    // also expose getPreloadFiles, useful for HTTP/2 push
    context.getPreloadFiles = renderer.getPreloadFiles.bind(renderer, context) // 将当前实例的getPreloadFiles方法，绑定所属对象后，植入到渲染上下文对象中
  }

  // render synchronously given rendered app content and render context
  /**
   * 将vue实例的渲染结果插入到模板中，并在模板中插入其他如head的内容、css、js等资源
   * @param {string} content 渲染结果
   * @param {Object} context 渲染上下文
   * @returns
   */
  render (content: string, context: ?Object): string | Promise<string> {
    const template = this.parsedTemplate
    if (!template) {
      throw new Error('render cannot be called without a template.')
    }
    context = context || {}

    if (typeof template === 'function') {
      return template(content, context)
    }

    if (this.inject) { // 以注入的方式渲染
      return (
        template.head(context) + // 编译模板的</head>前的部分，使用渲染上下文对象填充
        (context.head || '') + // 插入渲染上下文中的head的内容
        this.renderResourceHints(context) + // 添加preload和prelink的资源的节点
        this.renderStyles(context) + // 添加样式节点
        template.neck(context) + // 编译模板的</head>到<!--vue-ssr-outlet-->前的部分
        content + // 插入vue实例的渲染结果
        this.renderState(context) + // 插入state的渲染结果
        this.renderScripts(context) + // 插入js节点
        template.tail(context) // 编译模板的<!--vue-ssr-outlet-->之后的部分
      )
    } else { // 以非注入的方式渲染
      return (
        template.head(context) + // 编译模板的</head>前的部分，使用渲染上下文对象填充
        template.neck(context) + // 编译模板的</head>到<!--vue-ssr-outlet-->前的部分
        content + // 插入vue实例的渲染结果
        template.tail(context) // 编译模板的<!--vue-ssr-outlet-->之后的部分
      )
    }
  }

  renderStyles (context: Object): string {
    const initial = this.preloadFiles || []
    const async = this.getUsedAsyncFiles(context) || []
    const cssFiles = initial.concat(async).filter(({ file }) => isCSS(file))
    return (
      // render links for css files
      (cssFiles.length
        ? cssFiles.map(({ file }) => `<link rel="stylesheet" href="${this.publicPath}${file}">`).join('')
        : '') +
      // context.styles is a getter exposed by vue-style-loader which contains
      // the inline component styles collected during SSR
      (context.styles || '')
    )
  }

  renderResourceHints (context: Object): string {
    return this.renderPreloadLinks(context) + this.renderPrefetchLinks(context)
  }

  getPreloadFiles (context: Object): Array<Resource> {
    const usedAsyncFiles = this.getUsedAsyncFiles(context)
    if (this.preloadFiles || usedAsyncFiles) {
      return (this.preloadFiles || []).concat(usedAsyncFiles || [])
    } else {
      return []
    }
  }

  renderPreloadLinks (context: Object): string {
    const files = this.getPreloadFiles(context)
    const shouldPreload = this.options.shouldPreload
    if (files.length) {
      return files.map(({ file, extension, fileWithoutQuery, asType }) => {
        let extra = ''
        // by default, we only preload scripts or css
        if (!shouldPreload && asType !== 'script' && asType !== 'style') {
          return ''
        }
        // user wants to explicitly control what to preload
        if (shouldPreload && !shouldPreload(fileWithoutQuery, asType)) {
          return ''
        }
        if (asType === 'font') {
          extra = ` type="font/${extension}" crossorigin`
        }
        return `<link rel="preload" href="${
          this.publicPath}${file
        }"${
          asType !== '' ? ` as="${asType}"` : ''
        }${
          extra
        }>`
      }).join('')
    } else {
      return ''
    }
  }

  renderPrefetchLinks (context: Object): string {
    const shouldPrefetch = this.options.shouldPrefetch
    if (this.prefetchFiles) {
      const usedAsyncFiles = this.getUsedAsyncFiles(context)
      const alreadyRendered = file => {
        return usedAsyncFiles && usedAsyncFiles.some(f => f.file === file)
      }
      return this.prefetchFiles.map(({ file, fileWithoutQuery, asType }) => {
        if (shouldPrefetch && !shouldPrefetch(fileWithoutQuery, asType)) {
          return ''
        }
        if (alreadyRendered(file)) {
          return ''
        }
        return `<link rel="prefetch" href="${this.publicPath}${file}">`
      }).join('')
    } else {
      return ''
    }
  }

  renderState (context: Object, options?: Object): string {
    const {
      contextKey = 'state',
      windowKey = '__INITIAL_STATE__'
    } = options || {}
    const state = this.serialize(context[contextKey])
    const autoRemove = process.env.NODE_ENV === 'production'
      ? ';(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());'
      : ''
    const nonceAttr = context.nonce ? ` nonce="${context.nonce}"` : ''
    return context[contextKey]
      ? `<script${nonceAttr}>window.${windowKey}=${state}${autoRemove}</script>`
      : ''
  }

  renderScripts (context: Object): string {
    if (this.clientManifest) {
      const initial = this.preloadFiles.filter(({ file }) => isJS(file))
      const async = (this.getUsedAsyncFiles(context) || []).filter(({ file }) => isJS(file))
      const needed = [initial[0]].concat(async, initial.slice(1))
      return needed.map(({ file }) => {
        return `<script src="${this.publicPath}${file}" defer></script>`
      }).join('')
    } else {
      return ''
    }
  }

  getUsedAsyncFiles (context: Object): ?Array<Resource> {
    if (!context._mappedFiles && context._registeredComponents && this.mapFiles) {
      const registered = Array.from(context._registeredComponents)
      context._mappedFiles = this.mapFiles(registered).map(normalizeFile)
    }
    return context._mappedFiles
  }

  // create a transform stream
  createStream (context: ?Object): TemplateStream {
    if (!this.parsedTemplate) {
      throw new Error('createStream cannot be called without a template.')
    }
    return new TemplateStream(this, this.parsedTemplate, context || {})
  }
}

function normalizeFile (file: string): Resource {
  const withoutQuery = file.replace(/\?.*/, '')
  const extension = path.extname(withoutQuery).slice(1)
  return {
    file,
    extension,
    fileWithoutQuery: withoutQuery,
    asType: getPreloadType(extension)
  }
}

function getPreloadType (ext: string): string {
  if (ext === 'js') {
    return 'script'
  } else if (ext === 'css') {
    return 'style'
  } else if (/jpe?g|png|svg|gif|webp|ico/.test(ext)) {
    return 'image'
  } else if (/woff2?|ttf|otf|eot/.test(ext)) {
    return 'font'
  } else {
    // not exhausting all possibilities here, but above covers common cases
    return ''
  }
}
