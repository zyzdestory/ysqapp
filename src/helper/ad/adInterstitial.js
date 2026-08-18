const ad = require('@service.ad')
import adTracker from './adTracker'
const AD_TYPE = adTracker.AD_TYPES.INTERSTITIAL

const DEFAULT_GROUP_OPTIONS = {
  random: false,
  retryInterval: 1000
}

class InterstitialAd {
  constructor(adUnitId, options = {}) {
    this.adUnitId = adUnitId
    this.options = {
      channel: null,
      ...options
    }
    this.interstitialAd = null
    this.closeCallback = null
    this.timeouts = []
  }

  create() {
    return new Promise((resolve, reject) => {
      this._createAndLoad(resolve, reject)
    })
  }

  _createAndLoad(resolve, reject) {
    try {
      if (this.interstitialAd) {
        this.destroy()
      }

      adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_REQUEST, {
        adUnitId: this.adUnitId
      })

      this.interstitialAd = ad.createInterstitialAd({
        adUnitId: this.adUnitId,
        channel: this.options.channel
      })

      this.interstitialAd.onLoad(() => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN, {
          adUnitId: this.adUnitId
        })
        resolve({
          interstitialAd: this.interstitialAd,
          adUnitId: this.adUnitId
        })
      })

      this.interstitialAd.onError((err) => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN_FAIL, {
          adUnitId: this.adUnitId,
          error: err
        })
        reject({
          error: err,
          adUnitId: this.adUnitId
        })
      })

      this.interstitialAd.onClose((res) => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_CLOSE, {
          adUnitId: this.adUnitId,
          isEnded: res && res.isEnded
        })
        if (this.closeCallback) {
          this.closeCallback({ adUnitId: this.adUnitId, isEnded: res && res.isEnded })
        }
      })
    } catch (e) {
      adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN_FAIL, {
        adUnitId: this.adUnitId,
        error: e.message
      })
      reject({
        error: e,
        adUnitId: this.adUnitId
      })
    }
  }

  show() {
    return new Promise((resolve, reject) => {
      if (!this.interstitialAd) {
        reject(new Error('InterstitialAd not created'))
        return
      }

      this.interstitialAd.show()
        .then(() => {
          adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_SHOW, {
            adUnitId: this.adUnitId
          })
          resolve()
        })
        .catch((err) => {
          adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_SHOW_FAIL, {
            adUnitId: this.adUnitId,
            error: err
          })
          reject(err)
        })
    })
  }

  destroy() {
    this.timeouts.forEach(timeoutId => {
      clearTimeout(timeoutId)
    })
    this.timeouts = []

    if (this.interstitialAd) {
      try {
        this.interstitialAd.destroy()
      } catch (e) {
        console.error('InterstitialAd destroy error:', e)
      }
      this.interstitialAd = null
    }
  }

  on(event, callback) {
    if (!this.interstitialAd) return

    if (event === 'click') {
      this.interstitialAd.onClick(() => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_CLICK, {
          adUnitId: this.adUnitId
        })
        callback && callback()
      })
    }

    if (event === 'close') {
      this.closeCallback = callback
    }
  }
}

function createInterstitialAdGroup(adUnitIds, options = {}) {
  return new Promise((resolve, reject) => {
    if (!adUnitIds || !Array.isArray(adUnitIds) || adUnitIds.length === 0) {
      reject(new Error('adUnitIds must be a non-empty array'))
      return
    }

    const groupOptions = {
      ...DEFAULT_GROUP_OPTIONS,
      ...options.group
    }

    const availableAdUnitIds = [...adUnitIds]
    const usedAdUnitIds = []

    const tryNextAd = () => {
      if (availableAdUnitIds.length === 0) {
        reject({
          error: 'All ad units failed',
          failedAdUnitIds: [...usedAdUnitIds]
        })
        return
      }

      let adUnitId
      let originalIndex

      if (groupOptions.random) {
        const randomIndex = Math.floor(Math.random() * availableAdUnitIds.length)
        adUnitId = availableAdUnitIds[randomIndex]
        originalIndex = adUnitIds.indexOf(adUnitId)
        availableAdUnitIds.splice(randomIndex, 1)
      } else {
        adUnitId = availableAdUnitIds.shift()
        originalIndex = adUnitIds.indexOf(adUnitId)
      }

      usedAdUnitIds.push(adUnitId)

      const interstitialAd = new InterstitialAd(adUnitId, options)
      interstitialAd.create()
        .then((result) => {
          resolve({
            ...result,
            interstitialAdInstance: interstitialAd,
            index: originalIndex,
            totalCount: adUnitIds.length,
            usedCount: usedAdUnitIds.length,
            usedAdUnitIds: [...usedAdUnitIds],
            cancel: () => {
              interstitialAd.destroy()
            }
          })
        })
        .catch((err) => {
          const timeoutId = setTimeout(() => {
            tryNextAd()
          }, groupOptions.retryInterval)
          interstitialAd.timeouts.push(timeoutId)
        })
    }

    tryNextAd()
  })
}

function createInterstitialAd(adUnitId, options = {}) {
  return new InterstitialAd(adUnitId, options).create()
}

export default {
  InterstitialAd,
  createInterstitialAd,
  createInterstitialAdGroup
}
