import { calculateFingerprint } from '../fingerprint'

describe('Fingerprint Integration Test', () => {
  it('should generate fingerprints and test both enhanced CLI and legacy modes', async () => {
    console.log('🔍 Testing enhanced CLI fingerprinting implementation...')
    
    // Test multiple fingerprint generations
    const results = []
    for (let i = 0; i < 3; i++) {
      const start = Date.now()
      const fingerprint = await calculateFingerprint()
      const duration = Date.now() - start
      
      results.push({
        fingerprint,
        duration,
        isEnhanced: fingerprint.startsWith('enhanced-') || fingerprint.startsWith('fp-'),
        isLegacy: fingerprint.startsWith('legacy-')
      })
      
      console.log(`Attempt ${i + 1}: ${fingerprint} (${duration}ms)`)
    }
    
    // Verify all fingerprints are valid
    results.forEach((result, index) => {
      expect(result.fingerprint).toBeDefined()
      expect(typeof result.fingerprint).toBe('string')
      expect(result.fingerprint.length).toBeGreaterThan(20)
      expect(result.isEnhanced || result.isLegacy).toBe(true)
    })
    
    // Check uniqueness patterns
    // Enhanced fingerprints should be deterministic (same each time)
    // Legacy fingerprints should be unique (due to random suffix)
    const enhancedResults = results.filter(r => r.isEnhanced)
    const legacyResults = results.filter(r => r.isLegacy)
    
    if (enhancedResults.length > 1) {
      // Enhanced fingerprints should be identical (deterministic)
      const uniqueEnhanced = new Set(enhancedResults.map(r => r.fingerprint))
      expect(uniqueEnhanced.size).toBe(1)
    }
    
    if (legacyResults.length > 1) {
      // Legacy fingerprints should be unique (random suffix)
      const uniqueLegacy = new Set(legacyResults.map(r => r.fingerprint))
      expect(uniqueLegacy.size).toBe(legacyResults.length)
    }
    
    // Log summary
    const enhancedCount = results.filter(r => r.isEnhanced).length
    const legacyCount = results.filter(r => r.isLegacy).length
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
    
    console.log(`\n📊 Results Summary:`)
    console.log(`   Enhanced: ${enhancedCount}/${results.length}`)
    console.log(`   Legacy: ${legacyCount}/${results.length}`)
    console.log(`   Avg Duration: ${avgDuration.toFixed(0)}ms`)
    
    // At least one should succeed
    expect(results.length).toBeGreaterThan(0)
  }, 10000) // 10 second timeout for CLI operations
})
