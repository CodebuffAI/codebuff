# Sequential Deep Thinker Agent

## Genel Bakış
Sequential Deep Thinker, .agents klasöründeki mevcut agent örnekleri analiz edilerek geliştirilmiş kapsamlı bir düşünme agent'ıdır. MCP Sequential Thinking protokolünü kullanarak adım adım analiz, revizyon ve sentez yetenekleri sunar.

## Temel Özellikler

### 🎯 Kapsamlı Analiz
- **Model**: OpenAI GPT-5 (en güçlü reasoning model)
- **Reasoning Options**: High effort, excluded from output
- **Output Mode**: All messages (tüm düşünce sürecini gösterir)
- **Memory**: Message history dahil (context preservation)

### 🔧 Gelişmiş Düşünme Yetenekleri
- **Sequential Processing**: Adım adım mantıklı analiz
- **Dynamic Planning**: İhtiyaca göre düşünce sayısını ayarlama
- **Revision Logic**: Önceki düşünceleri gözden geçirme ve geliştirme
- **Branching**: Alternatif yaklaşımları paralel keşfetme
- **Synthesis**: Tüm insights'ları sentezleme

### 🛠️ Teknik Detaylar
```typescript
// Agent Configuration
{
  id: 'sequential-thinker',
  model: 'openai/gpt-5',
  reasoningOptions: { enabled: true, effort: 'high', exclude: true },
  toolNames: ['mcp_sequential_thinking_sequentialthinking', 'end_turn'],
  outputMode: 'all_messages',
  includeMessageHistory: true
}
```

## Kullanım Senaryoları

### 1. Karmaşık Problem Çözme
```
"Bir startup'ın core infrastructure için in-house geliştirme vs mevcut çözümleri satın alma arasında nasıl karar vermesi gerekir?"
```

### 2. Stratejik Karar Verme
```
"Büyüyen bir e-ticaret platformu için microservices vs monolithic architecture trade-off'larını analiz et."
```

### 3. Çok Boyutlu Analiz
```
"Büyük bir development team'de AI-powered code review implementasyonunun etkilerini değerlendir."
```

### 4. Araştırma ve İnceleme
```
"Finansal modelleme için quantum computing adoption'ın potansiyel risk ve faydalarını analiz et."
```

## Düşünce Süreci

### Faz 1: İlk Analiz
- Problem kapsamını değerlendirme
- Karmaşıklık tahmini
- Yaklaşım planlaması

### Faz 2: Iteratif Geliştirme
- Sistematik keşif
- Kanıt toplama ve analiz
- Alternatif perspektif değerlendirmesi

### Faz 3: Kritik İnceleme
- Varsayımları sorgulama
- Mantık doğrulama
- Boşluk tespiti

### Faz 4: Sentez
- Insight entegrasyonu
- Sonuç formülasyonu
- Uygulanabilir öneriler

## Diğer Agent'larla Entegrasyon

### Tamamlayıcı Agent'lar
- **Researcher**: Dış bilgi toplama için
- **File Explorer**: Teknik kararlar için codebase context'i
- **Deepest Thinker**: Kritik kararlar için daha kapsamlı analiz

### Spawning Örnekleri
```typescript
// Diğer agent'lardan spawn etme
{
  agent_type: 'sequential-thinker',
  prompt: 'Bu karmaşık teknik kararı adım adım analiz et'
}
```

## Test Coverage

### Unit Tests
- ✅ Temel konfigürasyon doğrulaması
- ✅ Reasoning options kontrolü
- ✅ Tool configuration testi
- ✅ Input schema validasyonu
- ✅ HandleSteps generator testi
- ✅ Type compatibility kontrolü

### Test Çalıştırma
```bash
cd .agents
bun test sequential-thinker.test.ts
```

## Dosya Yapısı
```
.agents/
├── sequential-thinker.ts              # Ana agent tanımı
├── sequential-thinker-demo.md         # Kullanım kılavuzu ve örnekler
├── SEQUENTIAL_THINKER_README.md       # Bu dosya
└── __tests__/
    └── sequential-thinker.test.ts     # Unit testler
```

## Performans Karakteristikleri

| Özellik | Seviye | Açıklama |
|---------|--------|----------|
| Kapsamlılık | Çok Yüksek | Problemleri çok boyutlu analiz eder |
| Şeffaflık | Tam | Tüm düşünce sürecini gösterir |
| Uyarlanabilirlik | Yüksek | Problem karmaşıklığına göre ayarlanır |
| Verimlilik | Dengeli | Kapsamlı ama gereksiz detaydan kaçınır |
| Doğruluk | Yüksek | Sistematik yaklaşım hataları azaltır |

## En İyi Sonuçlar İçin İpuçları

1. **Spesifik Olun**: Net, detaylı problem tanımları sağlayın
2. **Context Ekleyin**: İlgili background bilgilerini paylaşın
3. **Beklenti Belirleyin**: Hızlı insight vs derin analiz ihtiyacını belirtin
4. **Takip Soruları**: Agent'ın sonuçlarını daha derin keşif için başlangıç noktası olarak kullanın

## Geliştirme Notları

Bu agent, mevcut .agents klasöründeki şu agent'ların analizi sonucu geliştirilmiştir:
- `deepest-thinker.ts` - Çoklu agent koordinasyonu
- `gemini-thinker-high.ts` - High effort reasoning
- `gpt5-thinker.ts` - GPT-5 quick thinking
- `sonnet-thinker.ts` - Balanced analysis
- `thinker.ts` (factory) - Base thinker patterns

MCP Sequential Thinking tool'unun tüm gelişmiş özelliklerini (revision, branching, dynamic planning) kullanarak en kapsamlı düşünme deneyimini sunar.