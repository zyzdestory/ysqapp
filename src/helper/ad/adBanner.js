const ad = require('@service.ad')
import adTracker from './adTracker'
const AD_TYPE = adTracker.AD_TYPES.BANNER

const DEFAULT_GROUP_OPTIONS = {
  random: false,
  retryInterval: 1000
}

class BannerAd {
  constructor(adUnitId, options = {}) {
    this.adUnitId = adUnitId
    this.options = {
      style: null,
      channel: null,
      ...options
    }
    this.bannerAd = null
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
      if (this.bannerAd) {
        this.destroy()
      }

      adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_REQUEST, {
        adUnitId: this.adUnitId
      })

      this.bannerAd = ad.createBannerAd({
        adUnitId: this.adUnitId,
        style: this.options.style,
        channel: this.options.channel
      })

      this.bannerAd.onLoad(() => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN, {
          adUnitId: this.adUnitId
        })
        resolve({
          bannerAd: this.bannerAd,
          adUnitId: this.adUnitId
        })
      })

      this.bannerAd.onError((err) => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN_FAIL, {
          adUnitId: this.adUnitId,
          error: err
        })
        reject({
          error: err,
          adUnitId: this.adUnitId
        })
      })

      this.bannerAd.onClose(() => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_CLOSE, {
          adUnitId: this.adUnitId
        })
        if (this.closeCallback) {
          this.closeCallback({ adUnitId: this.adUnitId })
        }
      })

      this.bannerAd.onClick(() => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_CLICK, {
          adUnitId: this.adUnitId
        })
        if (this.clickCallback) {
          this.clickCallback({ adUnitId: this.adUnitId })
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
      if (!this.bannerAd) {
        reject(new Error('BannerAd not created'))
        return
      }

      this.bannerAd.show()
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

  hide() {
    return new Promise((resolve, reject) => {
      if (!this.bannerAd) {
        reject(new Error('BannerAd not created'))
        return
      }

      this.bannerAd.hide()
        .then(() => {
          adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_CLOSE, {
            adUnitId: this.adUnitId,
            action: 'hide'
          })
          resolve()
        })
        .catch((err) => {
          adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_SHOW_FAIL, {
            adUnitId: this.adUnitId,
            error: err,
            action: 'hide'
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

    if (this.bannerAd) {
      try {
        this.bannerAd.destroy()
      } catch (e) {
        console.error('BannerAd destroy error:', e)
      }
      this.bannerAd = null
    }
  }

  on(event, callback) {
    if (!this.bannerAd) return

    if (event === 'click') {
      this.bannerAd.onClick(() => {
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

function createBannerAdGroup(adUnitIds, options = {}) {
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

      const bannerAd = new BannerAd(adUnitId, options)
      bannerAd.create()
        .then((result) => {

          resolve({
            ...result,
            bannerAdInstance: bannerAd,
            index: originalIndex,
            totalCount: adUnitIds.length,
            usedCount: usedAdUnitIds.length,
            usedAdUnitIds: [...usedAdUnitIds],
            cancel: () => {
              bannerAd.destroy()
            }
          })
        })
        .catch((err) => {
          const timeoutId = setTimeout(() => {
            tryNextAd()
          }, groupOptions.retryInterval)
          bannerAd.timeouts.push(timeoutId)
        })
    }

    tryNextAd()
  })
}

function createBannerAd(adUnitId, options = {}) {
  return new BannerAd(adUnitId, options).create()
}

export default {
  BannerAd,
  createBannerAd,
  createBannerAdGroup
}
