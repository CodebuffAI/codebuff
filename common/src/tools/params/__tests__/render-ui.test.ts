import { describe, expect, it } from 'bun:test'

import { parseRenderUIButtonWidget } from '../tool/render-ui'

describe('parseRenderUIButtonWidget', () => {
  it('preserves the resolved URL exactly', () => {
    const link =
      'https://index.trygravity.ai/go/resend?token=a%2Fb&opaque=(keep)'

    expect(
      parseRenderUIButtonWidget({
        type: 'button',
        text: ' Get Resend ',
        link,
        variant: 'secondary',
      }),
    ).toEqual({
      type: 'button',
      text: 'Get Resend',
      link,
      variant: 'secondary',
    })
  })

  it('defaults the visual variant and rejects unsafe or unresolved links', () => {
    expect(
      parseRenderUIButtonWidget({
        type: 'button',
        text: 'Open',
        link: 'https://example.com',
      }),
    ).toEqual({
      type: 'button',
      text: 'Open',
      link: 'https://example.com',
      variant: 'primary',
    })

    expect(
      parseRenderUIButtonWidget({
        type: 'button',
        text: 'Bad',
        link: 'javascript:alert(1)',
      }),
    ).toBeNull()
    expect(
      parseRenderUIButtonWidget({
        type: 'button',
        text: 'Padded',
        link: ' https://example.com ',
      }),
    ).toBeNull()
    expect(
      parseRenderUIButtonWidget({
        type: 'button',
        text: 'Unresolved',
        link: {
          source: 'gravity_index',
          search_id: 's1',
          service_slug: 'resend',
        },
      }),
    ).toBeNull()
  })
})
