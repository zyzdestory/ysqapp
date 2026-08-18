const ad = require('@service.ad')
import adTracker from './adTracker'
import prompt from '@system.prompt'
const AD_TYPE = adTracker.AD_TYPES.REWARDED_VIDEO

class RewardedVideoAd {
  constructor(adUnitId, options = {}) {
    this.adUnitId = adUnitId
    this.options = {
      channel: null,
      ...options
    }
    this.rewardedVideoAd = null
    this.isLoaded = false
    this.closeCallback = null
    this.timeouts = []
  }

  create() {
    return new Promise((resolve, reject) => {
      let settled = false
      const doneResolve = () => {
        if (settled) return
        settled = true
        this.isLoaded = true
        resolve()
      }
      const doneReject = (err) => {
        if (settled) return
        settled = true
        this.isLoaded = false
        reject(err)
      }

      try {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_REQUEST, {
          adUnitId: this.adUnitId
        })

        this.rewardedVideoAd = ad.createRewardedVideoAd({
          adUnitId: this.adUnitId,
          channel: this.options.channel
        })

        this.rewardedVideoAd.onLoad((res) => {
          adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN, {
            adUnitId: this.adUnitId
          })
          doneResolve()
        })

        this.rewardedVideoAd.onError((err) => {
          adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_RETURN_FAIL, {
            adUnitId: this.adUnitId,
            error: err
          })
          doneReject(err)
        })

        this.rewardedVideoAd.onClose((res) => {
          const hasReward = res && res.isEnded
          adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_CLOSE, {
            adUnitId: this.adUnitId,
            isEnded: res && res.isEnded,
            hasReward
          })
          this.isLoaded = false
          if (this.closeCallback) {
            this.closeCallback({ adUnitId: this.adUnitId, isEnded: res && res.isEnded, hasReward })
          }
        })

        // 兜底：3 秒内没收到 onLoad，强制 resolve（素材可能已缓存可展示）
        const timeoutId = setTimeout(() => {
          if (!settled) {
            console.log('[REWARD] onLoad timeout, force resolve for', this.adUnitId)
            doneResolve()
          }
        }, 3000)
        this.timeouts.push(timeoutId)
      } catch (e) {
        doneReject(e)
      }
    })
  }

  load() {
    return new Promise((resolve, reject) => {
      if (!this.rewardedVideoAd) {
        reject(new Error('Not created'))
        return
      }
      this.isLoaded = false
      this.rewardedVideoAd.load()
        .then(() => {
          this.isLoaded = true
          resolve()
        })
        .catch(err => {
          this.isLoaded = false
          reject(err)
        })
    })
  }

  show() {
    return new Promise((resolve, reject) => {
      if (!this.rewardedVideoAd) {
        reject(new Error('RewardedVideoAd not created'))
        return
      }

      this.rewardedVideoAd.show()
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
    this.isLoaded = false

    if (this.rewardedVideoAd) {
      try {
        this.rewardedVideoAd.destroy()
      } catch (e) {
        console.error('RewardedVideoAd destroy error:', e)
      }
      this.rewardedVideoAd = null
    }
  }

  on(event, callback) {
    if (!this.rewardedVideoAd) return

    if (event === 'click') {
      this.rewardedVideoAd.onClick(() => {
        adTracker.reportEvent(AD_TYPE, adTracker.TRACK_EVENTS.AD_CLICK, {
          adUnitId: this.adUnitId
        })
        callback && callback()
      })
    }

    if (event === 'reward') {
      // 不注册第二个 onClose，而是扩展现有 closeCallback
      const prevClose = this.closeCallback
      this.closeCallback = (res) => {
        if (res && res.isEnded) {
          callback && callback(res)
        }
        if (prevClose) {
          prevClose(res)
        }
      }
    }

    if (event === 'close') {
      const prevClose = this.closeCallback
      this.closeCallback = (res) => {
        callback && callback(res)
        if (prevClose) {
          prevClose(res)
        }
      }
    }
  }
}

function createRewardedVideoAdGroup(adUnitIds, options = {}) {
  return new Promise((resolve, reject) => {
    if (!adUnitIds || !Array.isArray(adUnitIds) || adUnitIds.length === 0) {
      reject(new Error('adUnitIds must be a non-empty array'))
      return
    }

    const groupOptions = {
      random: false,
      retryInterval: 1000,
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

      const rewardedVideoAd = new RewardedVideoAd(adUnitId, options)
      rewardedVideoAd.create()
        .then(() => {
          resolve({
            adUnitId,
            rewardedVideoAdInstance: rewardedVideoAd,
            index: originalIndex,
            totalCount: adUnitIds.length,
            usedCount: usedAdUnitIds.length,
            usedAdUnitIds: [...usedAdUnitIds],
            cancel: () => { rewardedVideoAd.destroy() }
          })
        })
        .catch(() => {
          const timeoutId = setTimeout(() => { tryNextAd() }, groupOptions.retryInterval)
          rewardedVideoAd.timeouts.push(timeoutId)
        })
    }

    tryNextAd()
  })
}

function createRewardedVideoAd(adUnitId, options = {}) {
  return new RewardedVideoAd(adUnitId, options).create()
}

export default {
  RewardedVideoAd,
  createRewardedVideoAd,
  createRewardedVideoAdGroup
}
