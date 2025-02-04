import { expect, describe, it } from 'bun:test'
import { parseToolCallXml } from '../parse-tool-call-xml'

describe('parseToolCallXml', () => {
  it('should parse basic XML tags', () => {
    const xml = `
      <action>click</action>
      <selector>#button</selector>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      action: 'click',
      selector: '#button'
    })
  })

  it('should handle empty input', () => {
    expect(parseToolCallXml('')).toEqual({})
    expect(parseToolCallXml('   ')).toEqual({})
  })

  it('should parse coordinate ranges for browser click action', () => {
    const xml = `
      <type>click</type>
      <xRange><min>100</min><max>120</max></xRange>
      <yRange><min>200</min><max>220</max></yRange>
      <waitForNavigation>true</waitForNavigation>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      type: 'click',
      xRange: { min: 100, max: 120 },
      yRange: { min: 200, max: 220 },
      waitForNavigation: true
    })
  })

  it('should handle nested XML tags in ranges', () => {
    const xml = `
      <type>click</type>
      <xRange>
        <min>100</min>
        <max>120</max>
      </xRange>
      <yRange>
        <min>200</min>
        <max>220</max>
      </yRange>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      type: 'click',
      xRange: { min: 100, max: 120 },
      yRange: { min: 200, max: 220 }
    })
  })

  it('should convert numeric values in ranges', () => {
    const xml = `
      <type>click</type>
      <xRange><min>50.5</min><max>75.5</max></xRange>
      <yRange><min>100</min><max>150</max></yRange>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      type: 'click',
      xRange: { min: 50.5, max: 75.5 },
      yRange: { min: 100, max: 150 }
    })
  })

  it('should convert boolean values', () => {
    const xml = `
      <waitForNavigation>true</waitForNavigation>
      <headless>false</headless>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      waitForNavigation: true,
      headless: false
    })
  })

  it('should convert numeric values', () => {
    const xml = `
      <delay>50</delay>
      <quality>80.5</quality>
      <timeout>1000</timeout>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      delay: 50,
      quality: 80.5,
      timeout: 1000
    })
  })

  it('should handle complex browser action example', () => {
    const xml = `
      <action>start</action>
      <url>http://localhost:3000/test?param=value</url>
      <waitUntil>networkidle0</waitUntil>
      <retryOptions>
        maxRetries: 3,
        retryDelay: 1000,
        retryOnErrors: ['TimeoutError', 'TargetClosedError']
      </retryOptions>
      <logFilter>
        types: ['error', 'warning'],
        minLevel: 2,
        categories: ['network', 'console']
      </logFilter>
      <timeout>15000</timeout>
      <headless>true</headless>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      action: 'start',
      url: 'http://localhost:3000/test?param=value',
      waitUntil: 'networkidle0',
      retryOptions: 'maxRetries: 3,\n        retryDelay: 1000,\n        retryOnErrors: [\'TimeoutError\', \'TargetClosedError\']',
      logFilter: 'types: [\'error\', \'warning\'],\n        minLevel: 2,\n        categories: [\'network\', \'console\']',
      timeout: 15000,
      headless: true
    })
  })

  it('should handle multiline content with whitespace', () => {
    const xml = `
      <selector>
        #main-content
        .button-class
        [data-test="submit"]
      </selector>
      <text>
        This is a
        multiline text
        with preserved whitespace
      </text>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      selector: '#main-content\n        .button-class\n        [data-test="submit"]',
      text: 'This is a\n        multiline text\n        with preserved whitespace'
    })
  })

  it('should handle diagnostic step example', () => {
    const xml = `
      <action>diagnose</action>
      <steps>
        - Click login button
        - Wait for form
        - Fill credentials
        - Submit form
        - Verify redirect
      </steps>
      <automated>true</automated>
      <maxSteps>5</maxSteps>
      <sessionTimeoutMs>300000</sessionTimeoutMs>
      <debug>true</debug>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      action: 'diagnose',
      steps: '- Click login button\n        - Wait for form\n        - Fill credentials\n        - Submit form\n        - Verify redirect',
      automated: true,
      maxSteps: 5,
      sessionTimeoutMs: 300000,
      debug: true
    })
  })

  it('should handle empty tags', () => {
    const xml = `
      <action>stop</action>
      <screenshot></screenshot>
      <debug></debug>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      action: 'stop',
      screenshot: '',
      debug: ''
    })
  })
})
