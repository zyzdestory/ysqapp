import $fetch from '@system.fetch'
import $utils from './utils'
import request from '@system.request'
import { getGlobalData, setGlobalData } from '../global'

const TIMEOUT = 10000

Promise.prototype.finally = function(callback) {
  const P = this.constructor
  return this.then(
    value => P.resolve(callback()).then(() => value),
    reason =>
      P.resolve(callback()).then(() => {
        throw reason
      })
  )
}
function getToken() {
  return new Promise((resolve, reject) => {
    const params = {
      grant_type: 'client_credentials',
      client_id: 'GZPrACNkdGIgBvytrbSnX3so',
      client_secret: 'Zp0NMmpSie2inUcn2dfAA4eWxTOUlJ2D'
    }
    $fetch
      .fetch({
        url: $utils.queryString(
          'https://aip.baidubce.com/oauth/2.0/token',
          params
        ),
        method: 'POST',
        header: {
          'content-type': 'application/json'
        }
      })
      .then(response => {
        const result = response.data
        const content = JSON.parse(result.data)
        const { access_token } = content
        setGlobalData('accessToken', access_token)
        resolve(access_token)
      })
  })
}
/**
 * 调用快应用 fetch 接口做网络请求
 * @param params
 */
async function fetchPromise(params) {
  const accessToken = getGlobalData('accessToken')
    ? getGlobalData('accessToken')
    : await getToken()
  const { url, method, data, headers } = params
  return new Promise((resolve, reject) => {
    $fetch
      .fetch({
        url: url + `?access_token=${accessToken}`,
        method,
        data,
        header: {
          'content-type': 'application/json',
          ...headers
        }
      })
      .then(response => {
        const result = response.data
        const content = JSON.parse(result.data)
        // console.log('~~~ response.data.data',content)
        console.log(
          '~~~ response.data.data',
          content,
          content.error_code,
          content.error_msg
        )
        if (content.error_code && content.error_code == 111) {
          return getToken().then(() => {
            resolve(fetchPromise(params))
          })
        } else {
          resolve(content)
        }
      })
      .catch((error, code) => {
        // console.log(`~~~ request fail, error=${error},code = ${code}`)
        reject(error)
      })
      .finally(() => {
        // console.info(`~~~ request @${params.url} has been completed.`)
        resolve()
      })
  })
}

/**
 * 处理网络请求，timeout 是网络请求超时之后返回，默认 20s 可自行修改
 * @param params
 */
function requestHandle(params, timeout = TIMEOUT) {
  try {
    return Promise.race([
      fetchPromise(params),
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('网络状况不太好，再刷新一次？'))
        }, timeout)
      })
    ])
  } catch (error) {
    console.log(error)
  }
}

async function uploadHandle(params) {
  const accessToken = getGlobalData('accessToken')
    ? getGlobalData('accessToken')
    : await getToken()
  const { url, files, data, method, headers } = params
  return new Promise((resolve, reject) => {
    // console.log('request-params',params)
    request
      .upload({
        url: url + `?access_token=${accessToken}`,
        method,
        files,
        data,
        header: {
          'content-type': 'multipart/form-data',
          ...headers
        }
      })
      .then(response => {
        console.log('~~~ upload success', response)
        const result = response.data
        if (result.code == 200) {
          const content = JSON.parse(result.data)
          if (content.error_code && content.error_code == 111) {
            return getToken().then(() => {
              resolve(uploadHandle(params))
            })
          } else {
            resolve(content)
          }
        } else {
          reject(result)
        }
      })
      .catch((error, code) => {
        console.log(`~~~ upload fail, error=${error},code = ${code}`)
        reject(error)
      })
  })
}

export default {
  post: function(url, params, headers = {}) {
    return requestHandle({
      method: 'post',
      url: url,
      data: params,
      headers
    })
  },
  get: function(url, params, headers = {}) {
    return requestHandle({
      method: 'get',
      url: $utils.queryString(url, params),
      headers
    })
  },
  put: function(url, params, headers = {}) {
    return requestHandle({
      method: 'put',
      url: url,
      data: params,
      headers
    })
  },
  upload: function(url, files, data = [], headers = {}) {
    return uploadHandle({
      method: 'POST',
      url,
      files,
      data,
      headers
    })
  }
}
