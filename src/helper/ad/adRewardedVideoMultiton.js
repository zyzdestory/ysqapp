const ad = require('@service.ad')
import adTracker from './adTracker'
import prompt from '@system.prompt'
const AD_TYPE = adTracker.AD_TYPES.REWARDED_VIDEO
const TRACK_EVENTS = adTracker.TRACK_EVENTS

const DEFAULT_OPTIONS = {
  mode: 'sequential',
  maxRetry: 3,
  retryInterval: 1000,
  channel: null,
  timeout: 10000
}

let lastInstance = null
let singletonInstance = null
let singletonPromise = null

class RewardedVideoAdMultiton {
  constructor(adUnitIds, options = {}) {
    if (!adUnitIds || !Array.isArray(adUnitIds) || adUnitIds.length === 0) {
      throw new Error('adUnitIds must be a non-empty array')
    }

    if (lastInstance && lastInstance !== this) {
      try {
        lastInstance._doDestroy()
      } catch (e) {
        console.log('[REWARD_MULTITON] destroy previous instance error:', e)
      }
    }
    lastInstance = this

    this.adUnitIds = [...adUnitIds]
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.currentIndex = 0
    this.retryCount = 0
    this.currentAdUnitId = null
    this.currentAdId = null
    this.currentPrice = null
    this.rewardVideoAdMultiton = null
    this.isLoaded = false
    this._eventListeners = {}
    this._destroyed = false
    this._settled = false
    this._timeoutId = null
  }

  _pickNextIndex() {
    const total = this.adUnitIds.length
    if (this.options.mode === 'random') {
      let idx
      do {
        idx = Math.floor(Math.random() * total)
      } while (idx === this.currentIndex && total > 1)
      return idx
    } else {
      return (this.currentIndex + 1) % total
    }
  }

  _reportEvent(event, extra = {}) {
    adTracker.reportEvent(AD_TYPE, event, {
      adUnitId: this.currentAdUnitId,
      price: this.currentPrice || '',
      adId: this.currentAdId || '',
      ...extra
    })
  }

  _createMultitonInstance() {
    this.rewardVideoAdMultiton = ad.createRewardedVideoAd({
      multiton: true
    })

    this.rewardVideoAdMultiton.onLoad((res) => {
      if (this._destroyed) return
      this._settled = true
      this.currentAdId = res && res.adid ? res.adid : ''
      this.currentPrice = res && res.price ? res.price : (this.currentPrice || '')
      this.isLoaded = true
      this._reportEvent(TRACK_EVENTS.AD_RETURN)
    })

    this.rewardVideoAdMultiton.onError((err) => {
      if (this._destroyed) return
      this._reportEvent(TRACK_EVENTS.AD_RETURN_FAIL, { error: err })
    })

    this.rewardVideoAdMultiton.onClose((res) => {
      if (this._destroyed) return
      this.isLoaded = false
      const hasReward = !!(res && res.isEnded)
      this._reportEvent(TRACK_EVENTS.AD_CLOSE, {
        isEnded: !!(res && res.isEnded),
        hasReward
      })
      const listeners = this._eventListeners['close'] || []
      listeners.forEach(cb => {
        try { cb({ adUnitId: this.currentAdUnitId, adId: this.currentAdId, isEnded: !!(res && res.isEnded), hasReward }) } catch (e) { }
      })
    })

    this.rewardVideoAdMultiton.onClick(() => {
      if (this._destroyed) return
      this._reportEvent(TRACK_EVENTS.AD_CLICK)
      const listeners = this._eventListeners['click'] || []
      listeners.forEach(cb => { try { cb({ adUnitId: this.currentAdUnitId, adId: this.currentAdId }) } catch (e) { } })
    })
  }

  _loadOne(adUnitId) {
    return new Promise((resolve, reject) => {
      if (!this.rewardVideoAdMultiton) {
        reject(new Error('Multiton instance not created'))
        return
      }

      if (this._timeoutId) {
        clearTimeout(this._timeoutId)
        this._timeoutId = null
      }

      this.currentAdUnitId = adUnitId
      this._settled = false
      this._reportEvent(TRACK_EVENTS.AD_REQUEST)

      this.rewardVideoAdMultiton.load({
        adUnitId,
        channel: this.options.channel,
        success: (data) => {
          if (this._destroyed) {
            reject(new Error('Instance destroyed'))
            return
          }
          this._settled = true
          this.currentAdId = data && data.adid ? data.adid : ''
          this.currentPrice = data && data.price ? data.price : ''
          this.isLoaded = true
          this._reportEvent(TRACK_EVENTS.AD_RETURN)
          resolve(data)
        },
        fail: (data, code) => {
          if (this._destroyed) {
            reject(new Error('Instance destroyed'))
            return
          }
          this._settled = true
          this._reportEvent(TRACK_EVENTS.AD_RETURN_FAIL, { error: { data, code } })
          reject({ data, code })
        }
      })

      this._timeoutId = setTimeout(() => {
        if (!this._settled && !this._destroyed) {
          this._settled = true
          console.log('[REWARD_MULTITON] load timeout for', adUnitId)
          reject(new Error('Load timeout'))
        }
      }, this.options.timeout)
    })
  }

  async init() {
    if (this._destroyed) {
      throw new Error('Instance destroyed')
    }

    this._createMultitonInstance()

    this.currentIndex = 0
    this.retryCount = 0
    this.currentAdUnitId = this.adUnitIds[this.currentIndex]

    return this._tryLoad()
  }

  async _tryLoad() {
    if (this._destroyed) {
      throw new Error('Instance destroyed')
    }

    try {
      const data = await this._loadOne(this.currentAdUnitId)
      return data
    } catch (err) {
      return this._handleLoadFail(err)
    }
  }

  _handleLoadFail(err) {
    if (this._destroyed) {
      throw err
    }

    this.retryCount++

    if (this.retryCount < this.options.maxRetry) {
      console.log(`[REWARD_MULTITON] retry ${this.retryCount}/${this.options.maxRetry} for ${this.currentAdUnitId}`)
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (this._destroyed) {
            reject(new Error('Instance destroyed'))
            return
          }
          this._tryLoad().then(resolve).catch(reject)
        }, this.options.retryInterval)
      })
    }

    console.log(`[REWARD_MULTITON] ad unit ${this.currentAdUnitId} exhausted retries, switching to next`)

    const nextIndex = this._pickNextIndex()
    if (nextIndex === 0 && this.currentIndex === 0 && this.adUnitIds.length === 1) {
      throw new Error('All ad units exhausted')
    }

    this.currentIndex = nextIndex
    this.currentAdUnitId = this.adUnitIds[this.currentIndex]
    this.retryCount = 0

    return this._tryLoad()
  }

  async loadNext() {
    if (this._destroyed) {
      throw new Error('Instance destroyed')
    }
    this.currentIndex = this._pickNextIndex()
    this.currentAdUnitId = this.adUnitIds[this.currentIndex]
    this.retryCount = 0
    return this._tryLoad()
  }

  async show(params = {}) {
    if (this._destroyed) {
      throw new Error('Instance destroyed')
    }

    if (!this.rewardVideoAdMultiton) {
      throw new Error('Not initialized, call init() first')
    }

    const adid = params.adid || this.currentAdId
    if (!adid) {
      throw new Error('No adId available')
    }

    const isValid = this.rewardVideoAdMultiton.isValid({ adid })
    if (!isValid) {
      console.log('[REWARD_MULTITON] adId invalid, reloading...')
      try {
        await this._loadOne(this.currentAdUnitId)
      } catch (e) {
        throw new Error('Ad invalid and reload failed')
      }
    }

    return new Promise((resolve, reject) => {
      this.rewardVideoAdMultiton.show({ adid })
        .then(() => {
          this._reportEvent(TRACK_EVENTS.AD_SHOW)
          resolve()
        })
        .catch((err) => {
          this._reportEvent(TRACK_EVENTS.AD_SHOW_FAIL, { error: err })
          reject(err)
        })
    })
  }

  on(event, callback) {
    if (!this._eventListeners[event]) {
      this._eventListeners[event] = []
    }
    this._eventListeners[event].push(callback)
  }

  off(event, callback) {
    if (!this._eventListeners[event]) return
    this._eventListeners[event] = this._eventListeners[event].filter(cb => cb !== callback)
  }

  _doDestroy() {
    this._destroyed = true
    this.isLoaded = false
    this._eventListeners = {}

    if (this._timeoutId) {
      clearTimeout(this._timeoutId)
      this._timeoutId = null
    }

    if (this.rewardVideoAdMultiton) {
      try {
        this.rewardVideoAdMultiton.destroy()
      } catch (e) {
        console.log('[REWARD_MULTITON] destroy error:', e)
      }
      this.rewardVideoAdMultiton = null
    }
  }

  destroy() {
    this._doDestroy()
    if (lastInstance === this) {
      lastInstance = null
    }
    if (singletonInstance === this) {
      singletonInstance = null
    }
  }

  get currentAdInfo() {
    return {
      adUnitId: this.currentAdUnitId,
      adId: this.currentAdId,
      price: this.currentPrice,
      isLoaded: this.isLoaded,
      retryCount: this.retryCount,
      currentIndex: this.currentIndex
    }
  }
}

function createRewardedVideo(adUnitIds, options = {}) {
  // 单例：激励视频底层 SDK 只允许一个实例，已存在且未销毁则直接复用
  if (singletonInstance && !singletonInstance._destroyed) {
    return Promise.resolve(singletonInstance)
  }
  // 正在初始化中：返回同一个 promise，避免并发创建多个实例
  if (singletonPromise) {
    return singletonPromise
  }
  const instance = new RewardedVideoAdMultiton(adUnitIds, options)
  singletonPromise = instance.init().then(() => {
    singletonInstance = instance
    singletonPromise = null
    return instance
  }).catch(err => {
    singletonPromise = null
    throw err
  })
  return singletonPromise
}

export default {
  RewardedVideoAdMultiton,
  createRewardedVideo
}
