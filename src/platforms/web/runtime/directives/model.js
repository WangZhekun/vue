/**
 * Not type checking this file because flow doesn't like attaching
 * properties to Elements.
 */

import { isTextInputType } from 'web/util/element'
import { looseEqual, looseIndexOf } from 'shared/util'
import { mergeVNodeHook } from 'core/vdom/helpers/index'
import { warn, isIE9, isIE, isEdge } from 'core/util/index'

/* istanbul ignore if */
if (isIE9) {
  // http://www.matts411.com/post/internet-explorer-9-oninput/
  document.addEventListener('selectionchange', () => { // ie9的补丁
    const el = document.activeElement
    if (el && el.vmodel) { // IE9的非lazy标志
      trigger(el, 'input') // 触发节点的input事件
    }
  })
}

const directive = { // v-model指令
  inserted (el, binding, vnode, oldVnode) {
    if (vnode.tag === 'select') { // select节点
      // #6903
      if (oldVnode.elm && !oldVnode.elm._vOptions) { // 旧虚拟节点的DOM节点存在，且备选项option的value集合不存在
        mergeVNodeHook(vnode, 'postpatch', () => { // 合并postpatch钩子，在虚拟节点重新渲染完后执行
          directive.componentUpdated(el, binding, vnode)
        })
      } else {
        setSelected(el, binding, vnode.context) // 根据绑定值设置select的选中状态
      }
      el._vOptions = [].map.call(el.options, getValue) // 备选项option的value集合
    } else if (vnode.tag === 'textarea' || isTextInputType(el.type)) { // textarea节点，或DOM节点是input，且type属性为text,number,password,search,email,tel,url其中之一
      el._vModifiers = binding.modifiers // 指令修饰符
      if (!binding.modifiers.lazy) { // 没有lazy修饰符
        el.addEventListener('compositionstart', onCompositionStart) // 复合事件开始监听，如汉字输入起始
        el.addEventListener('compositionend', onCompositionEnd) // 复合事件结束监听，如汉字输入结束
        // Safari < 10.2 & UIWebView doesn't fire compositionend when
        // switching focus before confirming composition choice
        // this also fixes the issue where some browsers e.g. iOS Chrome
        // fires "change" instead of "input" on autocomplete.
        el.addEventListener('change', onCompositionEnd) // 监听DOM的change事件
        /* istanbul ignore if */
        if (isIE9) {
          el.vmodel = true // IE9的非lazy标志
        }
      }
    }
  },

  componentUpdated (el, binding, vnode) {
    if (vnode.tag === 'select') { // 节点是select
      setSelected(el, binding, vnode.context) // 根据绑定值设置select的选中状态
      // in case the options rendered by v-for have changed,
      // it's possible that the value is out-of-sync with the rendered options.
      // detect such cases and filter out values that no longer has a matching
      // option in the DOM.
      const prevOptions = el._vOptions // 备选项option的value集合
      const curOptions = el._vOptions = [].map.call(el.options, getValue) // 重新取备选项option的value集合
      if (curOptions.some((o, i) => !looseEqual(o, prevOptions[i]))) { // 新value集合与旧value集合不相等
        // trigger change event if
        // no matching option found for at least one value
        // 至少有一个value没有备选项与之匹配
        const needReset = el.multiple // 多选
          ? binding.value.some(v => hasNoMatchingOption(v, curOptions)) // 绑定值（数组）中存在没有在新的value集合中的项
          : binding.value !== binding.oldValue && hasNoMatchingOption(binding.value, curOptions) // 绑定值存在变化，且新绑定值没有在新备选value集合匹配的项
        if (needReset) {
          trigger(el, 'change') // 触发change事件 TODO：为什么备选项中没有匹配项，才会触发change事件
        }
      }
    }
  }
}

/**
 * 根据绑定值设置select的选中状态
 * @param {Element} el DOM节点
 * @param {Object} binding 指令的绑定独享
 * @param {Component} vm 组件实例
 */
function setSelected (el, binding, vm) {
  actuallySetSelected(el, binding, vm) // 根据绑定值设置select的选中状态
  /* istanbul ignore if */
  if (isIE || isEdge) { // IE或Edge TODO: 为什么要这么处理
    setTimeout(() => { // 在本更新周期结束后，设置select的选中状态
      actuallySetSelected(el, binding, vm)
    }, 0)
  }
}

/**
 * 根据绑定值设置select的选中状态
 * 单选-选中索引selectedIndex，多选-option的selected
 * @param {Element} el DOM节点
 * @param {Object} binding 指令的绑定独享
 * @param {Component} vm 组件实例
 */
function actuallySetSelected (el, binding, vm) {
  const value = binding.value // 指令的绑定值
  const isMultiple = el.multiple // select的多选
  if (isMultiple && !Array.isArray(value)) { // 多选，且绑定值不是数组
    process.env.NODE_ENV !== 'production' && warn(
      `<select multiple v-model="${binding.expression}"> ` +
      `expects an Array value for its binding, but got ${
        Object.prototype.toString.call(value).slice(8, -1)
      }`,
      vm
    )
    return
  }
  let selected, option
  for (let i = 0, l = el.options.length; i < l; i++) { // 遍历备选项
    option = el.options[i]
    if (isMultiple) { // 多选
      selected = looseIndexOf(value, getValue(option)) > -1 // 获取与绑定值宽松相等（值相等）的option的索引，如果该索引存在，则该option被选中
      if (option.selected !== selected) { // 置option的选中标志
        option.selected = selected
      }
    } else { // 单选
      if (looseEqual(getValue(option), value)) { // option的值与绑定值宽松相等
        if (el.selectedIndex !== i) { // 置选中的索引
          el.selectedIndex = i
        }
        return
      }
    }
  }
  if (!isMultiple) { // 单选
    el.selectedIndex = -1 // 选中索引置初始值
  }
}

/**
 * 备选项中没有与目标值宽松相等的项
 * @param {any} value 目标值
 * @param {Element} options 备选项
 */
function hasNoMatchingOption (value, options) {
  return options.every(o => !looseEqual(o, value))
}

/**
 * 获取option的value
 * @param {Element} option select的option节点
 */
function getValue (option) {
  return '_value' in option
    ? option._value
    : option.value
}

/**
 * 复合事件开始，如输入汉字
 * @param {Event} e DOM事件对象
 */
function onCompositionStart (e) {
  e.target.composing = true // 复合事件进行中标志
}

/**
 * 复合事件结束，如输入汉字
 * @param {Event} e DOM事件对象
 */
function onCompositionEnd (e) {
  // prevent triggering an input event for no reason
  if (!e.target.composing) return // 如果复合事件已经结束，则不作处理
  e.target.composing = false // 复合事件结束标志
  trigger(e.target, 'input') // 触发input鼠键
}

/**
 *
 * @param {Element} el DOM节点
 * @param {string} type 事件类型
 */
function trigger (el, type) {
  const e = document.createEvent('HTMLEvents') // 创建事件对象
  e.initEvent(type, true, true) // 初始化事件对象，可起泡，可用 preventDefault() 方法取消事件。
  el.dispatchEvent(e) // 触发事件
}

export default directive
