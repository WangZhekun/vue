/* @flow */

import * as nodeOps from 'weex/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'weex/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules) // 合并基础模块和平台运行时模块

export const patch: Function = createPatchFunction({ // 获取创建、更新、删除VNode的函数
  nodeOps,
  modules,
  LONG_LIST_THRESHOLD: 10
})
