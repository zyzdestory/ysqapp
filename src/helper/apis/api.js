import $ajax from '../ajax'

const baseUrl = 'http://ad-monetization.bjqiyue.com.cn'

export default {
  getApi(data) {
    return $ajax.get(`${baseUrl}/your-project-api`, data)
  },
  postOtherApi(data) {
    return $ajax.post(`${baseUrl}/your-project-api`, data)
  },

  /**
   * 获取推广位配置策略
   * @param {Object} params - 请求参数
   * @param {number} params.channelId - 渠道ID
   * @param {number} params.mediaId - 媒体ID
   */
  fetchPromotionConfig(params = {}) {
    return $ajax.get(`${baseUrl}/api/promotionPositionConfig`, params)
  },

  /**
   * 上报广告数据埋点
   * @param {string} eventType - 事件类型 (如: ad_request, ad_show, ad_click)
   * @param {Object} reportData - 上报数据
   */
  reportAdTrack(eventType, reportData = {}) {
    return $ajax.post(`${baseUrl}/api/ad/log`, {
      eventType: eventType,
      data: reportData
    })
  },

  /**
   * 上报应用级别数据埋点
   * @param {string} eventType - 事件类型 (如: page_view, session_start)
   * @param {Object} reportData - 上报数据
   */
  reportAppTrack(eventType, reportData = {}) {
    return $ajax.post(`${baseUrl}/api/app/log`, {
      eventType: eventType,
      data: reportData
    })
  }
}