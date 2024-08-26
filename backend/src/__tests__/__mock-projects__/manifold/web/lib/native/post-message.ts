import { webToNativeMessageType } from 'common/native-message'
import { getIsNative } from 'web/lib/native/is-native'

export const postMessageToNative = (
  type: webToNativeMessageType,
  data: any
) => {
  const isNative = getIsNative()
  if (
    isNative &&
    (window as any).ReactNativeWebView &&
    // NOTE: After the webview is killed on android due to OOM, postMessage will be undefined, see: https://github.com/react-native-webview/react-native-webview/issues/2680
    typeof (window as any).ReactNativeWebView.postMessage === 'function'
  ) {
    ;(window as any).ReactNativeWebView?.postMessage(
      JSON.stringify({
        type,
        data,
      })
    )
  }
}
