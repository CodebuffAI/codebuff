import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { QRCode } from 'web/components/widgets/qr-code'
import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { Tabs } from 'web/components/layout/tabs'
import { track } from 'web/lib/service/analytics'

export const MobileAppsQRCodeButton = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  return (
    <>
      <Button
        color="indigo-outline"
        onClick={() => {
          setIsModalOpen(true)
          track('banner click get app')
        }}
      >
        Get the app
      </Button>
      <MobileAppsQRCodeDialog
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />
    </>
  )
}

export const MobileAppsQRCodeDialog = (props: {
  isModalOpen: boolean
  setIsModalOpen: (isOpen: boolean) => void
}) => {
  const { isModalOpen, setIsModalOpen } = props
  return (
    <Modal open={isModalOpen} setOpen={setIsModalOpen}>
      <Col className={'bg-canvas-0 rounded-2xl p-4'}>
        <span className={'text-primary-700 py-2 text-2xl'}>
          Get the Manifold app
        </span>
        <span className={'py-2 '}>
          Scan this QR code to download the app. (Or search "Manifold" in the
          app store.)
        </span>
        <Tabs
          tabs={[
            {
              title: 'Apple',
              content: (
                <Col className={'w-full items-center justify-center p-4'}>
                  <QRCode url={APPLE_APP_URL} />
                </Col>
              ),
            },
            {
              title: 'Android',
              content: (
                <Col className={'w-full items-center justify-center p-4'}>
                  <QRCode url={GOOGLE_PLAY_APP_URL} />
                </Col>
              ),
            },
          ]}
        />
      </Col>
    </Modal>
  )
}
