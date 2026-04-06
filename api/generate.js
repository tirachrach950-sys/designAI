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
    const { messages, model, max_tokens, pexelsQuery } = req.body;

    // Fetch image from Pexels if query provided
    let imageUrl = null;
    let imagePhotographer = null;

    if (pexelsKey && pexelsQuery) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery)}&per_page=5&orientation=landscape`,
          { headers: { Authorization: pexelsKey } }
        );
        const pexelsData = await pexelsRes.json();
        if (pexelsData.photos && pexelsData.photos.length > 0) {
          const photo = pexelsData.photos[Math.floor(Math.random() * pexelsData.photos.length)];
          imageUrl = photo.src.large;
          imagePhotographer = photo.photographer;
        }
      } catch (pexelsErr) {
        console.error('Pexels error:', pexelsErr);
      }
    }

    // Add image info to the prompt if available
    let finalMessages = messages;
    if (imageUrl) {
      const lastMsg = messages[messages.length - 1];
      const enhancedContent = lastMsg.content +
        `\n\nIMPORTANT: Include this real photo in the design using this exact img tag: <img src="${imageUrl}" style="width:100%;height:220px;object-fit:cover;border-radius:12px;margin-bottom:1rem" alt="design image">
Photo credit: ${imagePhotographer} on Pexels. Place the image prominently in the design.`;
      finalMessages = [
        ...messages.slice(0, -1),
        { ...lastMsg, content: enhancedContent }
      ];
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 3000,
        messages: finalMessages,
      }),
    });

    const data = await response.json();
    return res.status(response.status).json({ ...data, imageUrl, imagePhotographer });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
