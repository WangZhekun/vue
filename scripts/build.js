const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const rollup = require('rollup')
const terser = require('terser')

// 创建dist目录
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist')
}

let builds = require('./config').getAllBuilds() // 获取所有构建目标的配置对象

// filter builds via command line arg
if (process.argv[2]) { // 如果当前脚本执行命令，在脚本后还有参数
  const filters = process.argv[2].split(',') // 将第一个参数以逗号分隔
  builds = builds.filter(b => { // 过滤所有构建目标的配置对象，配置对象的输出文件或名称中包含filters中的内容
    return filters.some(f => b.output.file.indexOf(f) > -1 || b._name.indexOf(f) > -1)
  })
} else {
  // filter out weex builds by default
  // 过滤配置对象的输出文件中不包含weex字符串的配置对象
  builds = builds.filter(b => {
    return b.output.file.indexOf('weex') === -1
  })
}

build(builds)

/**
 * 逐个按照配置对象构建项目
 * @param {Array<Object>} builds 构建目标的配置对象数组
 */
function build (builds) {
  let built = 0
  const total = builds.length
  const next = () => {
    buildEntry(builds[built]).then(() => { // 按照配置对象构建
      built++
      if (built < total) {
        next()
      }
    }).catch(logError)
  }

  next() // 递归调用next函数，对所有配置对象调用buildEntry函数
}

/**
 * 按照配置对象构建
 * @param {Object} config 构建目标的配置对象
 */
function buildEntry (config) {
  const output = config.output // 输出配置
  const { file, banner } = output
  const isProd = /(min|prod)\.js$/.test(file) // 输出文件中是否包含min.js
  return rollup.rollup(config)
    .then(bundle => bundle.generate(output))
    .then(({ output: [{ code }] }) => {
      if (isProd) {
        const minified = (banner ? banner + '\n' : '') + terser.minify(code, {
          toplevel: true,
          output: {
            ascii_only: true
          },
          compress: {
            pure_funcs: ['makeMap']
          }
        }).code
        return write(file, minified, true) // 生成文件
      } else {
        return write(file, code) // 生成文件
      }
    })
}

/**
 * 写文件
 * @param {string} dest 输出文件的绝对路径
 * @param {string} code 文件内容
 * @param {boolean} zip 是否压缩
 */
function write (dest, code, zip) {
  return new Promise((resolve, reject) => {
    function report (extra) {
      console.log(blue(path.relative(process.cwd(), dest)) + ' ' + getSize(code) + (extra || ''))
      resolve()
    }

    // 写文件
    fs.writeFile(dest, code, err => {
      if (err) return reject(err)
      if (zip) {
        // TODO: 为何要执行这一步，这一步并不影响文件输出？？？
        zlib.gzip(code, (err, zipped) => { // 压缩文件内容
          if (err) return reject(err)
          report(' (gzipped: ' + getSize(zipped) + ')')
        })
      } else {
        report()
      }
    })
  })
}

function getSize (code) {
  return (code.length / 1024).toFixed(2) + 'kb'
}

function logError (e) {
  console.log(e)
}

function blue (str) {
  return '\x1b[1m\x1b[34m' + str + '\x1b[39m\x1b[22m'
}
