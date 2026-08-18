const ad = require('@service.ad')
const device = require('@system.device')
const network = require('@system.network')
const pkg = require('@system.package')
import prompt from '@system.prompt'
const { setGlobalData, getGlobalData } = require('../../global')
const AD_TYPES = {
  BANNER: 'banner',
  INTERSTITIAL: 'interstitial',
  REWARDED_VIDEO: 'rewarded_video',
  NATIVE: 'native',
  APP: 'app'
}

const APP_TYPES = {
  PAGE: 'page',
  SESSION: 'session',
  ACTION: 'action',
  CUSTOM: 'custom'
}

const TRACK_EVENTS = {
  AD_REQUEST: 'ad_request',
  AD_RETURN: 'ad_return',
  AD_RETURN_FAIL: 'ad_return_fail',
  AD_SHOW: 'ad_show',
  AD_SHOW_FAIL: 'ad_show_fail',
  AD_CLICK: 'ad_click',
  AD_CLOSE: 'ad_close',
  APP_COLD_LAUNCH: 'app_cold_launch',
  APP_HOT_LAUNCH: 'app_hot_launch',
  PAGE_VIEW: 'page_view',
  PAGE_SHOW: 'page_show',
  PAGE_HIDE: 'page_hide',
  PAGE_DURATION: 'page_duration',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  ACTION_CLICK: 'action_click',
  ACTION_PAY: 'action_pay',
  ACTION_SHARE: 'action_share',
  CUSTOM_EVENT: 'custom_event'
}

let cachedDeviceInfo = {}
let cachedNetworkInfo = {}
let cachedPkgInfo = {}
let deviceIdReady = false

// App-level state
let appSessionId = null
let appLaunchTime = 0
let isFirstLaunch = true
let currentPage = null
let currentPageEnterTime = 0
let pageSequence = 0

function initDeviceInfo() {
  return new Promise((resolve) => {
    try {
      const manifest = require('../../manifest.json')

      if (manifest) {
        cachedPkgInfo = {
          packageName: manifest.package || '',
          versionName: manifest.versionName || '',
          versionCode: String(manifest.versionCode || '')
        }

        console.log('[AD_TRACK] pkgInfo from manifest:', JSON.stringify(cachedPkgInfo))
        resolve()
        return
      }
    } catch (e) {
      console.log('[AD_TRACK] require manifest fail:', e)
    }

    // 兜底：尝试用 pkg.getInfo 获取
    const pkgName = (global.$app && global.$app.$def && global.$app.$def.manifest && global.$app.$def.manifest.package) || ''
    if (pkgName) {
      pkg.getInfo({
        package: pkgName,
        success: (data) => {
          console.log('[AD_TRACK] pkg.getInfo success:', JSON.stringify(data))
          cachedPkgInfo = {
            packageName: data.packageName || data.name || pkgName,
            versionName: data.versionName || '',
            versionCode: String(data.versionCode || '')
          }
          resolve()
        },
        fail: (err) => {
          console.log('[AD_TRACK] pkg.getInfo fail:', err)
          cachedPkgInfo = { packageName: pkgName, versionName: '', versionCode: '' }
          resolve()
        }
      })
    } else {
      console.log('[AD_TRACK] no package name available, skip pkg.getInfo')
      resolve()
    }
  })
}

function initDeviceId() {
  if (deviceIdReady) return Promise.resolve()

  return new Promise((resolve) => {
    const savedId = getGlobalData('androidId')
    if (savedId) {
      deviceIdReady = true
      resolve()
      return
    }

    try {
      device.getOAID({
        success: (data) => {
          console.log('[AD_TRACK] getOAID success:', data)
          const oaid = data.oaid || ''
          if (oaid) {
            setGlobalData('androidId', oaid)
            deviceIdReady = true
          }
          resolve()
        },
        fail: (err) => {
          console.log('[AD_TRACK] getOAID fail:', err)
          // 兜底：用 getUserId
          try {
            device.getUserId({
              success: (data) => {
                const userId = data.userId || data.id || ''
                if (userId) {
                  setGlobalData('androidId', userId)
                  deviceIdReady = true
                }
                resolve()
              },
              fail: () => {
                // 再兜底：用系统信息
                try {
                  device.getInfo({
                    success: (info) => {
                      const fallbackId = info.brand + '_' + info.model || 'unknown'
                      setGlobalData('androidId', fallbackId)
                      deviceIdReady = true
                      resolve()
                    },
                    fail: () => resolve()
                  })
                } catch (e) {
                  resolve()
                }
              }
            })
          } catch (e) {
            resolve()
          }
        }
      })
    } catch (e) {
      console.log('[AD_TRACK] getOAID exception:', e)
      resolve()
    }
  })
}

function initNetworkInfo() {
  return new Promise((resolve) => {
    try {
      network.getIpAddress({
        success: (data) => {
          cachedNetworkInfo = {
            ip: data.ip || ''
          }
          resolve()
        },
        fail: () => {
          resolve()
        }
      })
    } catch (e) {
      console.log('[AD_TRACK] getIpAddress exception:', e && e.message)
      resolve()
    }
  })
}

function getBaseParams() {

  const provider = ad.getProvider ? ad.getProvider() : ''
  const deviceId = getGlobalData('androidId') || ''
  const channel = getGlobalData('channel') || ''
  const options = getGlobalData('adOptions') || {}

  return {
    timestamp: Date.now(),
    deviceId: deviceId,
    packageName: cachedPkgInfo.packageName || '',
    versionName: cachedPkgInfo.versionName || '',
    versionCode: cachedPkgInfo.versionCode || '',
    channel: channel,
    manufacturer: provider,
    ip: cachedNetworkInfo.ip || '',
    provider: provider,
    isPersonalRecommend: ad.isCanPersonalRecommend ? ad.isCanPersonalRecommend() : null,
    props: options
  }
}

function reportEvent(adType, event, params = {}) {
  ensureInit().then(() => {
    const baseParams = getBaseParams()
    const reportData = { ...baseParams, adType: adType, ...params }

    sendAdTrackRequest(event, reportData)

    try {
      const globalReportEvent = getGlobalData('reportEvent')
      if (globalReportEvent && typeof globalReportEvent === 'function') {
        globalReportEvent({
          key: `ad_${event}`,
          name: event,
          param: JSON.stringify(reportData)
        })
      }
    } catch (e) {
      console.error('[AD_TRACK] global reportEvent error:', e)
    }
  })
}

// ========== App-level tracking ==========

function generateSessionId() {
  return 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
}

function initApp() {
  appLaunchTime = Date.now()
  appSessionId = generateSessionId()

  if (isFirstLaunch) {
    isFirstLaunch = false
    appTrackerReport(APP_TYPES.SESSION, TRACK_EVENTS.APP_COLD_LAUNCH, {
      session_id: appSessionId,
      launch_time: appLaunchTime
    })
  } else {
    appTrackerReport(APP_TYPES.SESSION, TRACK_EVENTS.APP_HOT_LAUNCH, {
      session_id: appSessionId,
      launch_time: appLaunchTime
    })
  }

  appTrackerReport(APP_TYPES.SESSION, TRACK_EVENTS.SESSION_START, {
    session_id: appSessionId,
    seq: pageSequence
  })

  return appSessionId
}

function trackPageShow(pageName, params = {}) {


  if (!pageName) return

  if (currentPage && currentPage !== pageName) {
    const duration = Date.now() - currentPageEnterTime
    appTrackerReport(APP_TYPES.PAGE, TRACK_EVENTS.PAGE_DURATION, {
      page: currentPage,
      duration: duration,
      session_id: appSessionId,
      seq: pageSequence
    })
  }

  currentPage = pageName
  currentPageEnterTime = Date.now()
  pageSequence++

  const { type, ...restParams } = params

  if (type) {
 
    appTrackerReport(APP_TYPES.PAGE, type, {
      page: pageName,
      session_id: appSessionId,
      seq: pageSequence,
      ...restParams
    })
  } else {
    appTrackerReport(APP_TYPES.PAGE, TRACK_EVENTS.PAGE_SHOW, {
      page: pageName,
      session_id: appSessionId,
      seq: pageSequence,
      ...restParams
    })

    appTrackerReport(APP_TYPES.PAGE, TRACK_EVENTS.PAGE_VIEW, {
      page: pageName,
      session_id: appSessionId,
      seq: pageSequence,
      ...restParams
    })
  }
}

function trackPageHide(pageName, params = {}) {
  if (!pageName) return

  const duration = Date.now() - currentPageEnterTime
  appTrackerReport(APP_TYPES.PAGE, TRACK_EVENTS.PAGE_HIDE, {
    page: pageName,
    duration: duration,
    session_id: appSessionId,
    seq: pageSequence,
    ...params
  })

  appTrackerReport(APP_TYPES.PAGE, TRACK_EVENTS.PAGE_DURATION, {
    page: pageName,
    duration: duration,
    session_id: appSessionId,
    seq: pageSequence
  })
}

function trackAction(actionName, params = {}) {
  if (!actionName) return

  appTrackerReport(APP_TYPES.ACTION, TRACK_EVENTS.ACTION_CLICK, {
    action: actionName,
    page: currentPage,
    session_id: appSessionId,
    seq: pageSequence,
    ...params
  })
}

function trackPay(params = {}) {
  appTrackerReport(APP_TYPES.ACTION, TRACK_EVENTS.ACTION_PAY, {
    page: currentPage,
    session_id: appSessionId,
    seq: pageSequence,
    ...params
  })
}

function trackShare(params = {}) {
  appTrackerReport(APP_TYPES.ACTION, TRACK_EVENTS.ACTION_SHARE, {
    page: currentPage,
    session_id: appSessionId,
    seq: pageSequence,
    ...params
  })
}

function trackCustom(eventName, params = {}) {
  if (!eventName) return

  appTrackerReport(APP_TYPES.CUSTOM, eventName, {
    page: currentPage,
    session_id: appSessionId,
    seq: pageSequence,
    ...params
  })
}

function appTrackerReport(appType, event, params = {}) {
  ensureInit().then(() => {
    const baseParams = getBaseParams()
    const reportData = {
      ...baseParams,
      appType: appType,
      eventType: event,
      current_page: currentPage,
      ...params
    }

    sendAppTrackRequest(event, reportData)

    try {
      const globalReportEvent = getGlobalData('reportEvent')
      if (globalReportEvent && typeof globalReportEvent === 'function') {
        globalReportEvent({
          key: `app_${event}`,
          name: event,
          param: JSON.stringify(reportData)
        })
      }
    } catch (e) {
      console.error('[APP_TRACK] global reportEvent error:', e)
    }
  })
}

function sendAdTrackRequest(event, reportData) {
  try {
    const $apis = getGlobalData('$apis')
    if ($apis && $apis.api && $apis.api.reportAdTrack) {
      $apis.api.reportAdTrack(event, reportData).catch(() => {})
    } else {
      console.log('[AD_TRACK] $apis.api.reportAdTrack not available')
    }
  } catch (e) {
    console.error('[AD_TRACK] sendAdTrackRequest error:', e)
  }
}

function sendAppTrackRequest(event, reportData) {
  try {
    const $apis = getGlobalData('$apis')
    if ($apis && $apis.api && $apis.api.reportAppTrack) {
      $apis.api.reportAppTrack(event, reportData).catch((e) => {
        console.log(e,123)
      })
    } else {
      console.log('[APP_TRACK] $apis.api.reportAppTrack not available')
    }
  } catch (e) {
    console.error('[APP_TRACK] sendAppTrackRequest error:', e)
  }
}

function setTrackParams(customParams) {
  if (customParams) {
    if (customParams.media !== undefined) {
      cachedDeviceInfo.media = customParams.media
    }
  }
}

let initStarted = false
let initReady = false
let initPromise = null

function ensureInit() {
  if (initReady) {
    console.log('[AD_TRACK] ensureInit: already ready')
    return Promise.resolve()
  }
  if (initStarted) {
    console.log('[AD_TRACK] ensureInit: already started, waiting...')
    return initPromise
  }
  initStarted = true
  console.log('[AD_TRACK] ensureInit: starting...')

  initPromise = Promise.all([
    initDeviceInfo(),
    initDeviceId(),
    initNetworkInfo()
  ]).then((results) => {
    initReady = true
    console.log('[AD_TRACK] All init done, results:', results)
    console.log('[AD_TRACK] pkgInfo:', JSON.stringify(cachedPkgInfo))
    console.log('[AD_TRACK] deviceId:', getGlobalData('androidId'))
    console.log('[AD_TRACK] networkInfo:', JSON.stringify(cachedNetworkInfo))
    return results
  }).catch((e) => {
    console.error('[AD_TRACK] ensureInit error:', e && e.message, e)
    initReady = true
  })

  return initPromise
}

export default {
  AD_TYPES,
  APP_TYPES,
  TRACK_EVENTS,
  reportEvent,
  setTrackParams,
  ensureInit,
  trackPageShow,
  trackCustom,
}
