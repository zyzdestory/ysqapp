/**
 * 您可以将常用的方法、或系统 API，统一封装，暴露全局，以便各页面、组件调用，而无需 require / import.
 */
const prompt = require('@system.prompt')
import storage from '@system.storage'
import pkg from '@system.package'
/**
 * 拼接 url 和参数
 */
function queryString(url, query) {
  let str = []
  for (let key in query) {
    str.push(key + '=' + query[key])
  }
  let paramStr = str.join('&')
  return paramStr ? `${url}?${paramStr}` : url
}

function showToast(message = '', duration = 0) {
  if (!message) return
  prompt.showToast({
    message: message,
    duration
  })
}

function routerUrl(url, that) {
  router.push({
    uri: url
  })
}

const isAddDesk = (callback) => {
  shortcut.hasInstalled({
    success: (data) => {
      callback && callback(data)
    }
  })
}
const localStore = {
  setItem: (key, value, complete) => {
    storage.set({
      key,
      value,
      success: function (data) {
        complete && complete(data)
      },
      fail: function (data, code) {
        complete && complete(data, code)
      },
    })
  },
  getItem: (key, complete) => {
    storage.get({
      key,
      success: function (data) {
        complete && complete(data)
      },
      fail: function (data, code) {
        complete && complete(data, code)
      },
    })
  },
  deleteItem: key => {
    storage.delete({
      key,
      success: function (data) {
        // console.log('handling success')
      },
      fail: function (data, code) {
        // console.log(`handling fail, code = ${code}`)
      },
    })
  },
  clear: () => {
    storage.clear({
      success: function (data) {
        // console.log('handling success')
      },
      fail: function (data, code) {
        // console.log(`handling fail, code = ${code}`)
      },
    })
  },
}

const getAndroidId = async () => {
  await getDeviceId()
  console.log("getAndroidId=======》", getGlobalData('androidId'))
  return getGlobalData('androidId')
}

/**
 * 检查单个应用是否安装
 * @param {string} packageName - 应用包名
 * @returns {Promise<boolean>}
 */
function hasAppInstalled(packageName) {
  return new Promise((resolve) => {
    if (!packageName) {
      resolve(false)
      return
    }
    try {
      pkg.hasInstalled({
        package: packageName,
        success: (data) => {
          resolve(!!data.result)
        },
        fail: (err, code) => {
          console.log('[hasAppInstalled] fail:', packageName, err, code)
          resolve(false)
        }
      })
    } catch (e) {
      console.log('[hasAppInstalled] exception:', e)
      resolve(false)
    }
  })
}

/**
 * 检查多个应用是否安装（串行调用，避免并发冲突）
 * @param {string[]} packageNames - 应用包名数组
 * @returns {Promise<Object>} - 返回 { packageName: boolean } 映射
 */
async function checkAppsInstalled(packageNames) {
  if (!Array.isArray(packageNames) || packageNames.length === 0) {
    return {}
  }
  const results = {}
  for (let i = 0; i < packageNames.length; i++) {
    const pkgName = packageNames[i]
    const installed = await hasAppInstalled(pkgName)
    results[pkgName] = installed
  }
  return results
}

export default {
  showToast,
  queryString,
  getAndroidId,
  isAddDesk,
  localStore,
  routerUrl,
  hasAppInstalled,
  checkAppsInstalled
}
