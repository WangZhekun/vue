/* @flow */

const MAX_STACK_DEPTH = 800
const noop = _ => _

const defer = typeof process !== 'undefined' && process.nextTick
  ? process.nextTick
  : typeof Promise !== 'undefined'
    ? fn => Promise.resolve().then(fn)
    : typeof setTimeout !== 'undefined'
      ? setTimeout
      : noop

if (defer === noop) {
  throw new Error(
    'Your JavaScript runtime does not support any asynchronous primitives ' +
    'that are required by vue-server-renderer. Please use a polyfill for ' +
    'either Promise or setTimeout.'
  )
}

/**
 * 包装write函数，并对传入write函数的text进行缓存
 * @param {Function} write 被包装的回调函数
 * @param {Function} onError 出错时的回调函数
 * @returns write函数的包装函数
 */
export function createWriteFunction (
  write: (text: string, next: Function) => boolean,
  onError: Function
): Function {
  let stackDepth = 0
  const cachedWrite = (text, next) => {
    if (text && cachedWrite.caching) { // 将text加入缓存
      cachedWrite.cacheBuffer[cachedWrite.cacheBuffer.length - 1] += text
    }
    const waitForNext = write(text, next)
    if (waitForNext !== true) {
      // 调用next方法，防止多层递归
      if (stackDepth >= MAX_STACK_DEPTH) {
        defer(() => { // 下一个时钟周期执行
          try { next() } catch (e) {
            onError(e)
          }
        })
      } else {
        stackDepth++
        next()
        stackDepth--
      }
    }
  }
  cachedWrite.caching = false
  cachedWrite.cacheBuffer = []
  cachedWrite.componentBuffer = []
  return cachedWrite
}
