export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const anthropicKey = process.env.ANTHROPIC_KEY;
  const pexelsKey = process.env.PEXELS_KEY;

  if (!anthropicKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  try {
    const { messages, model, max_tokens, pexelsQuery, isPro } = req.body;

    // Same model for everyone — Sonnet with premium prompt
    const selectedModel = 'claude-sonnet-4-20250514';
    const selectedTokens = isPro ? 5000 : 4000;

    // Premium prompt for everyone — Pro gets extra polish
    const designPrefix = isPro
      ? `You are a world-class creative director at a top-tier agency like Pentagram or Apple Design Team. Create an ABSOLUTELY STUNNING, award-winning design. Every detail must be perfect — typography, spacing, color harmony, visual hierarchy. Use advanced CSS: glassmorphism, subtle gradients, box shadows, smooth transitions. This design must impress Fortune 500 clients.\n\n`
      : `You are an elite UI/UX designer creating premium, high-end designs. Your output must look like it was made by a top designer at Dribbble with 100k followers. Use sophisticated typography, refined color palettes, elegant spacing, and CSS effects like subtle shadows, gradients, and rounded corners. Every design must be visually stunning and conversion-optimized.\n\n`;

    // Fetch Pexels image
    let imageUrl = null;
    let imagePhotographer = null;

    if (pexelsKey && pexelsQuery) {
      try {
        let pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery)}&per_page=15&orientation=landscape`,
          { headers: { Authorization: pexelsKey } }
        );
        let pexelsData = await pexelsRes.json();

        if (!pexelsData.photos || pexelsData.photos.length === 0) {
          const shortQuery = pexelsQuery.split(' ').slice(0, 2).join(' ');
          pexelsRes = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(shortQuery)}&per_page=15&orientation=landscape`,
            { headers: { Authorization: pexelsKey } }
          );
          pexelsData = await pexelsRes.json();
        }

        if (pexelsData.photos && pexelsData.photos.length > 0) {
          const photo = pexelsData.photos[Math.floor(Math.random() * Math.min(5, pexelsData.photos.length))];
          imageUrl = isPro ? photo.src.original : photo.src.large2x;
          imagePhotographer = photo.photographer;
        }
      } catch (e) {
        console.error('Pexels error:', e);
      }
    }

    // Build final messages
    let finalMessages = messages;
    const lastMsg = messages[messages.length - 1];
    let enhancedContent = designPrefix + lastMsg.content;

    if (imageUrl) {
      enhancedContent += `\n\nIMPORTANT — Real photo to include:
<img src="${imageUrl}" style="width:100%;height:${isPro ? '300px' : '240px'};object-fit:cover;border-radius:${isPro ? '20px' : '14px'};margin-bottom:1.5rem;box-shadow:0 ${isPro ? '25px 80px' : '15px 50px'} rgba(0,0,0,0.12)" alt="photo">
Place this image prominently. Add creative overlay or gradient treatment on top if needed.
Photo by ${imagePhotographer} on Pexels.`;
    }

    // Add quality rules for everyone
    enhancedContent += `

QUALITY RULES (mandatory):
- Use Google Fonts (import 1-2 premium fonts like Playfair Display, Syne, Outfit, Plus Jakarta Sans)
- Perfect visual hierarchy: one dominant element, clear reading flow
- Sophisticated color palette: use the provided colors but add tints/shades creatively
- Generous whitespace — never cramped
- Subtle CSS effects: box-shadow, border-radius, gradients on backgrounds
- All text must be readable — high contrast
- Mobile-friendly proportions
- NO generic layouts — be creative and unexpected
- Result must look like a $5000 design agency created it`;

    finalMessages = [
      ...messages.slice(0, -1),
      { ...lastMsg, content: enhancedContent }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: selectedTokens,
        messages: finalMessages,
      }),
    });

    const data = await response.json();
    return res.status(response.status).json({
      ...data,
      imageUrl,
      imagePhotographer,
      modelUsed: selectedModel,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
