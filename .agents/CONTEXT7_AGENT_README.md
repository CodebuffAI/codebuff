# Context7 Documentation Expert Agent

## Genel Bakış
Context7 Documentation Expert, Context7 platformunu kullanarak güncel, sürüm-spesifik dokümantasyon ve kod örnekleri sağlayan özel bir agent'tır. Eski kod, hayali API'ler ve genel cevaplar gibi yaygın sorunları, güncel bilgilere doğrudan kaynaktan erişerek ortadan kaldırır.

## Temel Özellikler

### 🎯 Kapsamlı Teknoloji Desteği
- **Model**: OpenAI GPT-5 (en güçlü reasoning model)
- **Reasoning Options**: High effort, excluded from output
- **Output Mode**: All messages (tüm süreci gösterir)
- **Memory**: Message history dahil (context preservation)

### 🔧 Gelişmiş Dokümantasyon Yetenekleri
- **Smart Library Resolution**: Otomatik kütüphane tanımlama ve çözümleme
- **Up-to-Date Documentation**: Güncel, sürüm-spesifik dokümantasyon
- **Accurate Code Generation**: Çalışan kod örnekleri üretme
- **Context Integration**: Mevcut codebase ile entegrasyon
- **Version-Specific Guidance**: Sürüm-spesifik rehberlik

### 🛠️ Teknik Detaylar
```typescript
// Agent Configuration
{
  id: 'context7-agent',
  model: 'openai/gpt-5',
  reasoningOptions: { enabled: true, effort: 'high', exclude: true },
  toolNames: [
    'mcp_Context7_resolve_library_id',
    'mcp_Context7_get_library_docs',
    'code_search',
    'read_files',
    'end_turn'
  ],
  outputMode: 'all_messages',
  includeMessageHistory: true
}
```

## Kullanım Senaryoları

### 1. Kütüphane Kurulumu ve Konfigürasyonu
```
"Next.js 14 uygulamasında Supabase ile authentication nasıl kurulur?"
```

### 2. API Entegrasyonu
```
"MongoDB Node.js driver'ın son sürümü ile aggregation query'leri nasıl yapılır?"
```

### 3. Framework Migrasyonu
```
"React Router v5'ten v6'ya geçiş yaparken hangi breaking change'ler var?"
```

### 4. Troubleshooting ve Debugging
```
"Prisma v5'e upgrade ettikten sonra query'lerim çalışmıyor, ne değişti?"
```

### 5. Best Practice ve Optimizasyon
```
"Vue 3 ile TypeScript'te state management için önerilen yöntem nedir?"
```

## Desteklenen Teknolojiler

### Frontend Framework'leri
- **React**: Components, hooks, state management, routing
- **Vue**: Composition API, Pinia, Vue Router
- **Angular**: Components, services, RxJS patterns
- **Svelte/SvelteKit**: Stores, routing, SSR
- **Next.js**: App Router, API routes, middleware

### Backend Teknolojileri
- **Node.js**: Express, Fastify, NestJS
- **Python**: FastAPI, Django, Flask
- **Go**: Gin, Echo, Fiber
- **Rust**: Actix, Axum, Warp
- **Java**: Spring Boot, Quarkus

### Veritabanları ve ORM'ler
- **MongoDB**: Native driver, Mongoose
- **PostgreSQL**: pg, Prisma, TypeORM
- **Redis**: ioredis, node-redis
- **Supabase**: Client libraries, auth, realtime
- **Firebase**: Firestore, Auth, Functions

### Cloud ve DevOps
- **AWS**: SDK kullanımı, CDK patterns
- **Vercel**: Deployment, edge functions
- **Docker**: Containerization, multi-stage builds
- **Kubernetes**: Manifests, Helm charts

## Agent Workflow'u

### Adım 1: Query Analizi
```
Kullanıcı: "Express'te Socket.io ile real-time chat nasıl implement edilir?"
```

### Adım 2: Kütüphane Çözümleme
```
Agent şunları çözümler:
- socket.io (server library)
- express (web framework)
```

### Adım 3: Dokümantasyon Getirme
```
Agent şunları getirir:
- Socket.io server setup dokümantasyonu
- Express entegrasyon pattern'leri
- Real-time event handling örnekleri
```

### Adım 4: Çözüm Üretme
```
Agent şunları sağlar:
- Tam Express + Socket.io kurulumu
- Client-side bağlantı kodu
- Event handling pattern'leri
- Error handling ve reconnection logic
```

## Diğer Agent'larla Entegrasyon

### Tamamlayıcı Agent'lar
- **File Explorer**: Mevcut proje yapısını analiz etme
- **Code Reviewer**: Üretilen kodu proje standartlarına göre doğrulama
- **Researcher**: Teknoloji seçimleri hakkında ek context toplama
- **Sequential Thinker**: Karmaşık entegrasyon kararlarının derin analizi

### Spawning Örnekleri
```typescript
// Genel coding agent'tan
{
  agent_type: 'context7-agent',
  prompt: 'Apollo Server v4 ile GraphQL subscription implementasyonu için güncel dokümantasyon lazım'
}

// Proje kurulum agent'tan
{
  agent_type: 'context7-agent',
  prompt: 'Vitest ve React Testing Library ile testing kurulumu için son pattern'leri göster'
}
```

## MCP Tool Entegrasyonu

### Gerekli MCP Tool'ları
- `mcp_Context7_resolve_library_id`: Kütüphane identifier'larını çözümler
- `mcp_Context7_get_library_docs`: Dokümantasyon getirir
- `code_search`: Mevcut codebase'i analiz eder
- `read_files`: Proje dosyalarını context için okur

### Context7 Platform Özellikleri
- **Up-to-date Information**: Her zaman güncel bilgi
- **Version-Specific**: Sürüm-spesifik dokümantasyon
- **Source-Direct**: Doğrudan kaynaktan bilgi
- **Code Examples**: Çalışan kod örnekleri
- **API References**: Güncel API referansları

## Test Coverage

### Unit Tests
- ✅ Temel konfigürasyon doğrulaması
- ✅ Reasoning options kontrolü
- ✅ Tool configuration testi
- ✅ Input schema validasyonu
- ✅ HandleSteps generator testi
- ✅ Type compatibility kontrolü
- ✅ Context7 MCP tool entegrasyonu
- ✅ Agent capabilities validasyonu

### Test Çalıştırma
```bash
cd .agents
bun test context7-agent.test.ts
```

## Dosya Yapısı
```
.agents/
├── context7-agent.ts                 # Ana agent tanımı
├── context7-agent-demo.md            # İngilizce kullanım kılavuzu
├── CONTEXT7_AGENT_README.md          # Bu dosya (Türkçe)
└── __tests__/
    └── context7-agent.test.ts        # Kapsamlı unit testler
```

## Performans Karakteristikleri

| Özellik | Seviye | Açıklama |
|---------|--------|----------|
| Doğruluk | Çok Yüksek | Güncel, kaynak dokümantasyon kullanır |
| Güncellik | Her Zaman Güncel | Son sürüm bilgilerini getirir |
| Kapsamlılık | Yüksek | Comprehensive örnekler sağlar |
| Hız | Hızlı | Verimli dokümantasyon getirme |
| Güvenilirlik | Yüksek | Hayali API'leri ortadan kaldırır |

## En İyi Sonuçlar İçin İpuçları

### 1. Sürümler Hakkında Spesifik Olun
```
✅ İyi: "React Query v5'i Next.js 14 ile nasıl kullanırım?"
❌ Belirsiz: "React Query nasıl kullanılır?"
```

### 2. Context Ekleyin
```
✅ İyi: "Express 4'ten 5'e geçiş yapıyorum, breaking change'ler neler?"
❌ Belirsiz: "Express nasıl kullanılır?"
```

### 3. Use Case Belirtin
```
✅ İyi: "Multi-tenant SaaS app için Prisma ile PostgreSQL kurulumu"
❌ Belirsiz: "Prisma nasıl kullanılır?"
```

### 4. Kısıtlamaları Belirtin
```
✅ İyi: "Vue 3 için Vite ve ESLint ile TypeScript kurulumu"
❌ Belirsiz: "Vue 3 kurulumu"
```

## Yaygın Query Pattern'leri

### Kurulum ve İnstallasyon
- "[kütüphane]'yi [framework] ile nasıl kurarım?"
- "[araç]'ı [use case] için configure etmenin önerilen yolu nedir?"
- "[teknoloji stack] için installation süreci nasıl?"

### Entegrasyon ve Kullanım
- "[kütüphane A]'yı [kütüphane B] ile nasıl entegre ederim?"
- "[spesifik fonksiyonalite] için [kütüphane] kullanarak en iyi pattern nedir?"
- "[API/feature] kullanım örneklerini göster"

### Migrasyon ve Güncellemeler
- "[eski sürüm]'den [yeni sürüm]'e nasıl migrate ederim?"
- "[kütüphane] sürüm [X]'te ne değişti?"
- "Kodumu [eski pattern]'den [yeni pattern]'e güncelle"

### Troubleshooting
- "[kütüphane] ile [spesifik hata] neden oluyor?"
- "[framework/kütüphane]'de [sorun]'u nasıl çözerim?"
- "[edge case]'i handle etmenin doğru yolu nedir?"

## Örnek Etkileşimler

### React Query Kurulumu
```
Kullanıcı: "Next.js 14 App Router ile React Query v5 kurulumu"

Agent Süreci:
1. @tanstack/react-query ve Next.js kütüphanelerini çözümler
2. v5 dokümantasyonu ve App Router entegrasyonunu getirir
3. Provider'lar, hydration ve SSR ile tam kurulum sağlar
```

### Veritabanı Entegrasyonu
```
Kullanıcı: "Prisma'yı Supabase PostgreSQL ile row-level security'de bağla"

Agent Süreci:
1. Prisma ve Supabase dokümantasyonunu çözümler
2. RLS kurulum pattern'leri ve Prisma konfigürasyonunu getirir
3. Schema kurulumu, client konfigürasyonu ve security pattern'leri sağlar
```

### Authentication Implementasyonu
```
Kullanıcı: "Express'te refresh token'lı JWT authentication implement et"

Agent Süreci:
1. Express ve JWT kütüphane dokümantasyonunu çözümler
2. Güncel security best practice'leri getirir
3. Middleware ve token handling ile tam auth flow sağlar
```

## Gelişmiş Özellikler

### Multi-Library Koordinasyonu
- Birden fazla teknoloji içeren karmaşık query'leri handle eder
- Farklı kütüphane sürümleri arasında uyumluluk sağlar
- Teknoloji stack'leri için entegrasyon pattern'leri sağlar

### Sürüm-Spesifik Rehberlik
- Uygun kütüphane sürümlerini otomatik tespit eder ve kullanır
- Sürümler arası breaking change'leri vurgular
- Migration path'leri ve upgrade stratejileri sağlar

### Context-Aware Öneriler
- Mevcut proje yapısını analiz eder
- Mevcut mimariye uygun pattern'ler önerir
- Mevcut kod stili ile tutarlılığı korur

## Hata Yönetimi ve Fallback'ler

### Kütüphane Bulunamadı
- Benzer veya alternatif kütüphaneler önerir
- Teknoloji alanı için genel dokümantasyon sağlar
- İlgili teknolojileri aramayı teklif eder

### Dokümantasyon Boşlukları
- Genel best practice'lere fallback yapar
- Resmi dokümantasyon kaynaklarını önerir
- Community-recommended pattern'leri sağlar

### Sürüm Çakışmaları
- Uyumluluk sorunlarını tespit eder
- Uyumlu sürüm kombinasyonları önerir
- Workaround çözümleri sağlar

## Geliştirme Notları

Bu agent, mevcut .agents klasöründeki şu agent'ların analizi sonucu geliştirilmiştir:
- `ask.ts` - Base ask-mode agent patterns
- `researcher.ts` - Web search ve documentation analysis
- `file-picker.ts` - File system integration
- `deepest-thinker.ts` - Comprehensive analysis coordination
- `gemini-thinker.ts` - Creative problem solving

Context7 MCP Server'ın tüm gelişmiş özelliklerini (library resolution, documentation fetching, version-specific guidance) kullanarak en güncel ve doğru kod çözümleri sunar.

Bu agent, developer'ların dokümantasyona erişim ve kullanım şeklini dönüştürür, her zaman güncel ve doğru bilgiye sahip olmalarını sağlayarak güvenilir uygulamalar geliştirmelerine yardımcı olur.