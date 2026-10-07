package com.yujian.ai.network

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient
import javax.net.ssl.HttpsURLConnection

/**
 * 开发期网络绕过：后端 https://81.71.1.11 的自签证书只含 CN、没有 SAN IP 条目，
 * 而 Android OkHttp 做主机名校验时只认 SAN（忽略 CN），即使证书已通过
 * network_security_config 信任，仍会抛 SSLPeerUnverifiedException（JS 侧表现为
 * "Network request failed"）。
 *
 * 这里在 RN 的 OkHttp 客户端上仅对该 IP 放行主机名校验；证书链仍按
 * network_security_config（system/user/@raw/yujian_server）严格校验，其他域名
 * 仍走系统默认校验。后端换成正式域名 + 受信证书后删除本类及 MainApplication
 * 中的 install() 调用即可。
 */
class YujianNetworkFactory : OkHttpClientFactory {
  override fun createNewNetworkModuleClient(): OkHttpClient =
    OkHttpClientProvider.createClientBuilder()
      .hostnameVerifier { hostname, session ->
        hostname == SELF_SIGNED_HOST ||
          HttpsURLConnection.getDefaultHostnameVerifier().verify(hostname, session)
      }
      .build()

  companion object {
    private const val SELF_SIGNED_HOST = "81.71.1.11"

    /** 必须在 RN 首次创建网络客户端之前调用（MainApplication.onCreate）。 */
    fun install() {
      OkHttpClientProvider.setOkHttpClientFactory(YujianNetworkFactory())
    }
  }
}
