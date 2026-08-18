const env = ''
const co = 'ny'
const isEb = co === 'eb'
const baseUrl = `https://${env}${isEb ? 'quick-k' : 'quick'}.ntyy888.com`
const adUrl = `https://${env}${isEb ? 'log-k' : 'log'}.ntyy888.com/s.gif` //广告请求记录打点
const adlog = `https://${env}${isEb ? 'adlog-k' : 'adlog'}.ntyy888.com` //广告请求记录
const quickAcquireUrl = `https://${env}${isEb ? 'tagconfig-k' : 'tag'}.ntyy888.com/match/quick/acquire` //用户归因与广告配置
const reportUrl = `https://${env}${isEb ? 'report-k' : 'adlog'}.ntyy888.com`
const activeUrl = `https://images.ntyy888.com/20240912/active` //广告资源
const sourceUrl = `https://images.hzdx666.com/ltbzK/images/temp` //用于上传 oss
const downloadAdUrl = `https://${env}app-api.ntyy888.com/ntyyap/agmbrv` //广告代码

const pkgChannel = 'kyy'
const appSource = 'ltbzK'

const vendorIds = {
  honor: {
    auditedNative: [
      {
        n: '乐淘壁纸-自渲染信息流兜底',
        v: '2029441798713376768',
        source: '12',
        price: 0
      }
    ],
    auditedRv: [
      {
        n: '乐淘壁纸-激励视频兜底',
        v: '2029442011139407872',
        source: '12',
        price: 0
      }
    ],
    auditedCp: [
      {
        n: '乐淘壁纸-插屏兜底',
        v: '2029441908932608000',
        source: '12',
        price: 0
      }
    ]
  }
}
const toponIds = {}
export {
  env,
  isEb,
  baseUrl,
  adUrl,
  adlog,
  quickAcquireUrl,
  reportUrl,
  pkgChannel,
  appSource,
  vendorIds,
  activeUrl,
  sourceUrl,
  downloadAdUrl,
  toponIds
}
