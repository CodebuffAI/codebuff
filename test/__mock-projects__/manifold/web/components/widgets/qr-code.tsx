export function QRCode(props: {
  url: string
  className?: string
  width?: number
  height?: number
}) {
  const { url, className, width = 200, height = 200 } = props

  // url-encode the url
  const urlEncoded = encodeURIComponent(url)

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${width}x${height}&data=${urlEncoded}`

  return (
    <img
      src={qrUrl}
      width={width}
      height={height}
      className={className}
      alt={`QR code to ${urlEncoded}`}
    />
  )
}
