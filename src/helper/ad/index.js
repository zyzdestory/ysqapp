import adTracker from './adTracker'
import adBanner from './adBanner'
import adNative from './adNative'
import adInterstitial from './adInterstitial'
import adRewardedVideo from './adRewardedVideo'

export default {
  tracker: adTracker,
  banner: adBanner,
  native: adNative,
  interstitial: adInterstitial,
  rewardedVideo: adRewardedVideo,
  ensureInit: () => adTracker.ensureInit ? adTracker.ensureInit() : Promise.resolve()
}