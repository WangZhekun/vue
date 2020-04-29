/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

/**
 * 定义组件、指令、过滤器API：src/shared/constants.js中的ASSET_TYPES
 * @param {GlobalAPI} Vue Vue构造方法
 */
export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id] // 取组件、指令、过滤器
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        if (type === 'component' && isPlainObject(definition)) { // 组件，definition为纯对象
          definition.name = definition.name || id
          definition = this.options._base.extend(definition) // this为Vue构造器，this.options._base也是Vue构造器，extend方法为创建Vue类的子类
        }
        if (type === 'directive' && typeof definition === 'function') { // 指令，definition为函数
          definition = { bind: definition, update: definition }
        }
        this.options[type + 's'][id] = definition // 其他情况，this为Vue构造器
        return definition
      }
    }
  })
}
