#!/usr/bin/env bash
# ============================================================================
# setup-local-fonts.sh — Google Fonts'u kendi sunucunda barındır.
#
# Ne yapar:
#   1. Fraunces + Space Mono'nun .woff2 dosyalarını Google'dan İNDİRİR (bir kez)
#   2. /fonts/fonts.css dosyasını oluşturur (yollar yerel dosyalara işaret eder)
#   3. TÜM HTML dosyalarındaki 3 satırlık Google Fonts <link> bloğunu
#      tek satırlık <link rel="stylesheet" href="/fonts/fonts.css"> ile değiştirir
#
# Nasıl çalıştırılır (repo kök dizininde, bir kez):
#   bash setup-local-fonts.sh
#
# Sonrasında yapılacak tek manuel iş:
#   privacy/index.html içindeki "Google Fonts" maddesini sil — artık geçerli değil.
#
# Geri almak istersen: git checkout ile HTML'leri eski haline döndür,
# fonts/ klasörünü sil.
# ============================================================================
set -euo pipefail

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS_URL="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Space+Mono:wght@400;700&display=swap"

mkdir -p fonts
echo "1/3  Google Fonts CSS indiriliyor..."
curl -fsSL -A "$UA" "$CSS_URL" -o fonts/fonts.css

echo "2/3  .woff2 dosyaları indiriliyor..."
grep -o 'https://fonts.gstatic.com/[^)]*' fonts/fonts.css | sort -u | while read -r url; do
  name=$(basename "$url")
  echo "     -> $name"
  curl -fsSL "$url" -o "fonts/$name"
  # CSS içindeki uzak URL'yi yerel yolla değiştir (macOS/Linux uyumlu)
  perl -pi -e "s|\Q$url\E|/fonts/$name|g" fonts/fonts.css
done

echo "3/3  HTML dosyaları güncelleniyor..."
FILES="index.html 404.html privacy/index.html newsletter/index.html markets/index.html library/index.html about/index.html library/*/index.html"
for f in $FILES; do
  [ -f "$f" ] || continue
  perl -0pi -e 's|<link rel="preconnect" href="https://fonts\.googleapis\.com">\s*<link rel="preconnect" href="https://fonts\.gstatic\.com" crossorigin>\s*<link href="https://fonts\.googleapis\.com/css2[^"]*" rel="stylesheet">|<link rel="stylesheet" href="/fonts/fonts.css">|s' "$f"
  echo "     -> $f"
done

echo ""
echo "Bitti. Kontrol listesi:"
echo "  [ ] Siteyi lokalde açıp fontların yüklendiğini doğrula"
echo "  [ ] privacy/index.html'den Google Fonts maddesini sil"
echo "  [ ] Commit + push"
