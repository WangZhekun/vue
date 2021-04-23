/*
 * @Author:
 * @Date: 2021-03-27 15:54:22
 * @FilePath: /vue/src/server/template-renderer/parse-template.js
 * @Description: Do not edit
 */
/* @flow */

const compile = require('lodash.template')
const compileOptions = {
  escape: /{{([^{][\s\S]+?[^}])}}/g,
  interpolate: /{{{([\s\S]+?)}}}/g
}

export type ParsedTemplate = {
  head: (data: any) => string;
  neck: (data: any) => string;
  tail: (data: any) => string;
};

export function parseTemplate (
  template: string,
  contentPlaceholder?: string = '<!--vue-ssr-outlet-->'
): ParsedTemplate {
  if (typeof template === 'object') {
    return template
  }

  let i = template.indexOf('</head>')
  const j = template.indexOf(contentPlaceholder)

  if (j < 0) {
    throw new Error(`Content placeholder not found in template.`)
  }

  if (i < 0) {
    i = template.indexOf('<body>')
    if (i < 0) {
      i = j
    }
  }

  return {
    head: compile(template.slice(0, i), compileOptions), // 模板的</head>之前的部分，生成预编译模板方法，可在模板中插入值，详见lodash的template api
    neck: compile(template.slice(i, j), compileOptions), // 模板的</head>到<!--vue-ssr-outlet-->之前的位置
    tail: compile(template.slice(j + contentPlaceholder.length), compileOptions) // 模板的<!--vue-ssr-outlet-->之后部分
  }
}
