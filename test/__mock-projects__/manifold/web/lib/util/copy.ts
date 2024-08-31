// From: https://stackoverflow.com/a/33928558/1592933
// Copies a string to the clipboard. Must be called from within an
// event handler such as click. May return false if it failed, but
// this is not always possible. Browser support for Chrome 43+,
// Firefox 42+, Safari 10+, Edge and Internet Explorer 10+.
// Internet Explorer: The clipboard feature may be disabled by
// an administrator. By default a prompt is shown the first
// time the clipboard is used (per session).
import { getIsNative } from 'web/lib/native/is-native'
import { NativeShareData } from 'common/native-share-data'
import { postMessageToNative } from 'web/lib/native/post-message'

export function copyToClipboard(text: string) {
  if (getIsNative()) {
    postMessageToNative('share', {
      message: text,
    } as NativeShareData)
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
  } else if (
    (window as any).clipboardData &&
    (window as any).clipboardData.setData
  ) {
    console.log('copy 2')
    // Internet Explorer-specific code path to prevent textarea being shown while dialog is visible.
    return (window as any).clipboardData.setData('Text', text)
  } else if (
    document.queryCommandSupported &&
    document.queryCommandSupported('copy')
  ) {
    console.log('copy 3')
    const textarea = document.createElement('textarea')
    textarea.textContent = text
    textarea.style.position = 'fixed' // Prevent scrolling to bottom of page in Microsoft Edge.
    document.body.appendChild(textarea)
    textarea.select()
    try {
      return document.execCommand('copy') // Security exception may be thrown by some browsers.
    } catch (ex) {
      console.warn('Copy to clipboard failed.', ex)
      return prompt('Copy to clipboard: Ctrl+C, Enter', text)
    } finally {
      document.body.removeChild(textarea)
    }
  }
}
