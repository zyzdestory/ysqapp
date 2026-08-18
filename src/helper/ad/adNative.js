import ad from '@service.ad'
import adTracker from './adTracker'
import prompt from '@system.prompt'
const AD_TYPE = adTracker.AD_TYPES.NATIVE

const DEFAULT_OPTIONS = {
  count: 5,
  type: 'adView'
}

function preloadNativeAds(adUnitIds, options = {}) {
  return new Promise((resolve, reject) => {
    if (!adUnitIds || !Array.isArray(adUnitIds) || adUnitIds.length === 0) {
      reject(new Error('adUnitIds must be a non-empty array'))
      return
    }

    const opts = { ...DEFAULT_OPTIONS, ...options }
    const maxCount = Math.min(opts.count, adUnitIds.length)
    const results = []
    const failedIds = []
    let completed = 0
    let resolved = false
 
    if (maxCount <= 0) {
      reject({
        error: 'maxCount is 0',
        failedIds: []
      })
      return
    }

    const tryPreload = (adUnitId, retryCount = 0) => {
      const maxRetry = 3
      adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_REQUEST, {
        adUnitId,
        retryCount
      })

      ad.preloadAd({
        adUnitId,
        type: opts.type,
        success: (data) => {
          const adItem = data && data.adList && data.adList[0]
          const adId = adItem && adItem.adId
          const price = adItem && adItem.price

          if (adId) {
            adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN, {
              adUnitId,
              price,
              retryCount
            })
            results.push({
              adUnitId, adId, price
            })
            finishOne()
          } else {
            adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN_FAIL, {
              adUnitId,
              price,
              retryCount,
              error: 'No adId in response'
            })
            if (retryCount < maxRetry) {
              tryPreload(adUnitId, retryCount + 1)
            } else {
              failedIds.push(adUnitId)
              finishOne()
            }
          }
        },
        fail: (data, code) => {
          const adItem = data && data.adList && data.adList[0]
          const adId = adItem && adItem.adId
          const price = adItem && adItem.price
          if (adId) {
            adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN, {
              adUnitId,
              price,
              retryCount
            })
            results.push({
              adUnitId, adId, price
            })
            finishOne()
          } else {
            adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN_FAIL, {
              adUnitId,
              price,
              retryCount,
              error: { data, code }
            })
            if (retryCount < maxRetry) {
              tryPreload(adUnitId, retryCount + 1)
            } else {
              failedIds.push(adUnitId)
              finishOne()
            }
          }
        }
      })
    }

    const idsToUse = adUnitIds.slice(0, maxCount)
    let timeoutId = null
    let totalToComplete = idsToUse.length

    timeoutId = setTimeout(() => {
      if (resolved) return
      resolved = true
      console.log('[AD_NATIVE] preload timeout, completed:', completed, 'results:', results.length)
      if (results.length > 0) {
        resolve({
          adIds: results,
          failedIds: [...failedIds]
        })
      } else {
        reject({
          error: 'preload timeout',
          failedIds: [...failedIds]
        })
      }
    }, 10000)

    const finishOne = () => {
      if (resolved) return
      completed++
      if (results.length >= maxCount) {
        resolved = true
        clearTimeout(timeoutId)
        resolve({
          adIds: results,
          failedIds: [...failedIds]
        })
        return
      }

      if (completed >= totalToComplete) {
        resolved = true
        clearTimeout(timeoutId)
        if (results.length > 0) {
          resolve({
            adIds: results,
            failedIds: [...failedIds]
          })
        } else {
          reject({
            error: 'All ad preloads failed',
            failedIds: [...failedIds]
          })
        }
      }
    }

    console.log('[AD_NATIVE] preloadNativeAds start, idsToUse:', JSON.stringify(idsToUse), 'maxCount:', maxCount)
    idsToUse.forEach(id => tryPreload(id))
  })
}

export default {
  preloadNativeAds
}