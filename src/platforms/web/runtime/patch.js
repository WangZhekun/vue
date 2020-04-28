/* @flow */

import * as nodeOps from 'web/runtime/node-ops' // 节点操作对象
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index' // 基础模块 TODO：这里的模块是什么概念
import platformModules from 'web/runtime/modules/index' // 平台运行时模块

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules) // 合并基础模块和平台运行时模板

export const patch: Function = createPatchFunction({ nodeOps, modules })
