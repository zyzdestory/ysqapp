import device from '@system.device'
import ad from '@service.ad'
import router from '@system.router'

/*
 * Copyright (c) 2021-present, the hapjs-platform Project Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @file 全局能力的配置与获取
 * 文档地址：https://doc.quickapp.cn/tutorial/framework/optimization-skills.html#%E4%BD%BF%E7%94%A8-globaljs
 */

function getGlobalRef() {
  return Object.getPrototypeOf(global) || global
}

const quickappGlobal = getGlobalRef()

/**
 * 设置全局(被APP与Page共享)数据；
 * @param key {string}
 * @param val {*}
 */
function setGlobalData(key, val) {
  quickappGlobal[key] = val
}

/**
 * 获取全局(被APP与Page共享)数据；
 * @param key {string}
 * @return {*}
 */
function getGlobalData(key) {
  return quickappGlobal[key]
}

function getDeviceId() {
  let brand = getGlobalData('provider')
  let deviceId
  console.log('当前的设备id', getGlobalData('androidId'), brand)
  if (!brand) {
    brand = ad.getProvider()
    setGlobalData('provider', brand)
  }

  return new Promise(async (resolve, reject) => {
    if (deviceId) {
      setGlobalData('androidId', deviceId)
      resolve()
    } else {
      device.getUserId({
        success(data) {
          setGlobalData('androidId', data.userId)
          resolve()
        },
        fail(err, errCode) {
          console.log('userInfo获取失败')
        }
      })
    }
  })
}

function customRouterGo(app_group, isBack) {
  let nextPage = ''
  let params = {}
  const pathList = getGlobalData('routerPath')
  console.error('pathList', pathList)
  if (pathList && pathList.length > 0) {
    nextPage = pathList.shift()
    if (nextPage == 'Activity' || nextPage == 'PageH5') nextPage = 'activityPage'
    const { name } = router.getState()
    // 如果当前页就是要跳转页，那么不跳了直接跳下一个
    if (name == nextPage) {
      return customRouterGo(app_group, true)
    }
    console.error(nextPage, '跳转信息')
    router.push({ uri: '/' + nextPage, params })
    setTimeout(() => {
      router.clear()
    }, 500)
  } else {
    console.error('没有页面了===============')
    $utils.router.back()
  }
}

function debounceNew(fn, delay) {
  let t = null
  return function(...arge) {
    if (t) {
      clearTimeout(t)
    }

    t = setTimeout(() => {
      fn.apply(this, arge)
    }, delay)
  }
}

// 两个方法默认定义在全局
setGlobalData('setGlobalData', setGlobalData)
setGlobalData('getGlobalData', getGlobalData)
setGlobalData('getDeviceId', getDeviceId)
setGlobalData('customRouterGo', customRouterGo)
setGlobalData('debounceNew', debounceNew)

export { setGlobalData, getGlobalData }
