import { describe, it, expect } from 'bun:test'

import { parseToolCallXml } from '../parse-tool-call-xml'

describe('parseToolCallXml', () => {
  it('should parse basic key-value pairs', () => {
    const xml = `<key1>value1</key1><key2>value2</key2>`
    expect(parseToolCallXml(xml)).toEqual({
      key1: 'value1',
      key2: 'value2',
    })
  })

  it('should handle empty content', () => {
    const xml = `<key1></key1><key2>value2</key2>`
    expect(parseToolCallXml(xml)).toEqual({
      key1: '',
      key2: 'value2',
    })
  })

  it('should handle whitespace around values', () => {
    const xml = `<key1>  value1  </key1><key2>\nvalue2\n</key2>`
    expect(parseToolCallXml(xml)).toEqual({
      key1: 'value1',
      key2: 'value2',
    })
  })

  it('should handle internal whitespace', () => {
    const xml = `<key1>value with spaces</key1>`
    expect(parseToolCallXml(xml)).toEqual({
      key1: 'value with spaces',
    })
  })

  it('should return an empty object for empty or whitespace-only input', () => {
    expect(parseToolCallXml('')).toEqual({})
    expect(parseToolCallXml('   ')).toEqual({})
    expect(parseToolCallXml('\n\t')).toEqual({})
  })

  it('should handle special XML characters within values', () => {
    const xml = `<key1>&lt;value1&gt;</key1><key2>"value2's"</key2><key3>&amp;value3</key3>`
    expect(parseToolCallXml(xml)).toEqual({
      key1: '&lt;value1&gt;',
      key2: '"value2\'s"',
      key3: '&amp;value3',
    })
  })

  it('should parse numbers as strings', () => {
    const xml = `<key1>123</key1><key2>45.67</key2><key3>-8</key3>`
    expect(parseToolCallXml(xml)).toEqual({
      key1: '123',
      key2: '45.67',
      key3: '-8',
    })
  })

  it('should parse booleans as strings', () => {
    const xml = `<key1>true</key1><key2>false</key2>`
    expect(parseToolCallXml(xml)).toEqual({
      key1: 'true',
      key2: 'false',
    })
  })

  it('should parse nested range tags as raw string content', () => {
    const xml = `<xRange><min>100</min><max>120</max></xRange><yRange><min>200</min><max>220</max></yRange>`
    expect(parseToolCallXml(xml)).toEqual({
      xRange: '<min>100</min><max>120</max>',
      yRange: '<min>200</min><max>220</max>',
    })
  })

  it('should parse mixed types as strings', () => {
    const xml = `<text>hello</text><number>99</number><bool>true</bool><empty></empty>`
    expect(parseToolCallXml(xml)).toEqual({
      text: 'hello',
      number: '99',
      bool: 'true',
      empty: '',
    })
  })

  it('should handle complex example with various types (all as strings)', () => {
    const xml = `
      <action>click</action>
      <selector>#submit-button</selector>
      <timeout>5000</timeout>
      <force>false</force>
      <xRange><min>50.5</min><max>75.5</max></xRange>
      <yRange><min>100</min><max>150</max></yRange>
      <comment>Submit the form</comment>
    `
    expect(parseToolCallXml(xml)).toEqual({
      action: 'click',
      selector: '#submit-button',
      timeout: '5000',
      force: 'false',
      xRange: '<min>50.5</min><max>75.5</max>',
      yRange: '<min>100</min><max>150</max>',
      comment: 'Submit the form',
    })
  })

  it('should convert boolean values', () => {
    const xml = `
      <waitForNavigation>true</waitForNavigation>
      <headless>false</headless>
    `
    const result = parseToolCallXml(xml)
    expect(result).toEqual({
      waitForNavigation: 'true',
      headless: 'false',
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
      delay: '50',
      quality: '80.5',
      timeout: '1000',
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
      retryOptions:
        "maxRetries: 3,\n        retryDelay: 1000,\n        retryOnErrors: ['TimeoutError', 'TargetClosedError']",
      logFilter:
        "types: ['error', 'warning'],\n        minLevel: 2,\n        categories: ['network', 'console']",
      timeout: '15000',
      headless: 'true',
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
      selector:
        '#main-content\n        .button-class\n        [data-test="submit"]',
      text: 'This is a\n        multiline text\n        with preserved whitespace',
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
      steps:
        '- Click login button\n        - Wait for form\n        - Fill credentials\n        - Submit form\n        - Verify redirect',
      automated: 'true',
      maxSteps: '5',
      sessionTimeoutMs: '300000',
      debug: 'true',
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
      debug: '',
    })
  })
})
